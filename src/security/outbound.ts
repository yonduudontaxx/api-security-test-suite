export class OutboundError extends Error {
  readonly reason: 'redirect' | 'status' | 'too_large' | 'timeout' | 'network';

  constructor(reason: OutboundError['reason'], message: string) {
    super(message);
    this.reason = reason;
  }
}

export interface OutboundResponse {
  status: number;
  contentType: string;
  body: string;
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new OutboundError('too_large', 'Upstream response is too large');
  if (!response.body) return '';
  const chunks: Uint8Array[] = [];
  let received = 0;
  for await (const chunk of response.body) {
    received += chunk.byteLength;
    if (received > maxBytes) throw new OutboundError('too_large', 'Upstream response is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchWithLimits(
  url: URL,
  options: { timeoutMs: number; maxBytes: number },
): Promise<OutboundResponse> {
  const signal = AbortSignal.timeout(options.timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { redirect: 'manual', signal, headers: { accept: 'application/json, text/plain' } });
  } catch (error) {
    if (signal.aborted) throw new OutboundError('timeout', 'Upstream timed out');
    throw new OutboundError('network', error instanceof Error ? error.message : 'Upstream unreachable');
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new OutboundError('redirect', 'Upstream redirects are not followed');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new OutboundError('status', `Upstream responded with ${response.status}`);
  }
  try {
    const body = await readLimited(response, options.maxBytes);
    return { status: response.status, contentType: response.headers.get('content-type') ?? '', body };
  } catch (error) {
    if (signal.aborted) throw new OutboundError('timeout', 'Upstream timed out');
    throw error;
  }
}
