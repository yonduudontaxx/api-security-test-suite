import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { currentUser, type AppContext } from '../context.js';
import { ApiError, badRequest } from '../errors.js';
import { fetchWithLimits, OutboundError, type OutboundResponse } from '../security/outbound.js';
import { assertOutboundUrlAllowed } from '../security/url-guard.js';
import { asObject, parsePartnerProfile } from '../validation.js';

const IMPORT_MAX_BYTES = 1024 * 1024;
const PARTNER_MAX_BYTES = 64 * 1024;
const OUTBOUND_TIMEOUT_MS = 1500;

function toApiError(error: unknown, onRedirect: ApiError): ApiError {
  if (!(error instanceof OutboundError)) return new ApiError(502, 'upstream_error', 'Upstream request failed');
  if (error.reason === 'timeout') return new ApiError(504, 'upstream_timeout', 'Upstream timed out');
  if (error.reason === 'redirect') return onRedirect;
  return new ApiError(502, 'upstream_error', error.message);
}

async function vulnerableFetch(rawUrl: string): Promise<OutboundResponse> {
  if (rawUrl.startsWith('file:')) {
    return { status: 200, contentType: 'text/plain', body: await readFile(fileURLToPath(rawUrl), 'utf8') };
  }
  try {
    const response = await fetch(rawUrl, { signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS) });
    return { status: response.status, contentType: response.headers.get('content-type') ?? '', body: await response.text() };
  } catch (error) {
    throw new ApiError(502, 'upstream_error', error instanceof Error ? error.message : String(error));
  }
}

export function registerIntegrationRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { store, config, hardened } = ctx;

  app.post('/files/import', async (request, reply) => {
    const user = currentUser(request);
    const rawUrl = asObject(request.body).url;
    if (typeof rawUrl !== 'string' || rawUrl.length > 2048) throw badRequest('url is required');

    let fetched: OutboundResponse;
    if (hardened) {
      const url = assertOutboundUrlAllowed(rawUrl, config.importAllowedOrigins);
      try {
        fetched = await fetchWithLimits(url, { timeoutMs: OUTBOUND_TIMEOUT_MS, maxBytes: IMPORT_MAX_BYTES });
      } catch (error) {
        throw toApiError(error, new ApiError(400, 'redirect_not_allowed', 'Redirects are not followed'));
      }
    } else {
      fetched = await vulnerableFetch(rawUrl);
    }

    const file = {
      id: randomUUID(),
      ownerId: user.id,
      sourceUrl: rawUrl,
      contentType: fetched.contentType,
      sizeBytes: Buffer.byteLength(fetched.body),
      content: fetched.body,
    };
    store.files.set(file.id, file);
    const { content, ...metadata } = file;
    return reply.code(201).send({ ...metadata, preview: content.slice(0, 200) });
  });

  app.get<{ Params: { partnerId: string } }>('/partners/:partnerId', async (request) => {
    currentUser(request);
    const { partnerId } = request.params;

    if (!hardened) {
      const response = await fetch(`${config.upstreamUrl}/partners/${partnerId}`);
      return response.json();
    }

    if (!/^[a-z0-9-]{1,40}$/.test(partnerId)) throw badRequest('partnerId is invalid');
    let fetched: OutboundResponse;
    try {
      fetched = await fetchWithLimits(new URL(`/partners/${partnerId}`, config.upstreamUrl), {
        timeoutMs: OUTBOUND_TIMEOUT_MS,
        maxBytes: PARTNER_MAX_BYTES,
      });
    } catch (error) {
      throw toApiError(error, new ApiError(502, 'upstream_error', 'Upstream redirects are not followed'));
    }
    try {
      return parsePartnerProfile(JSON.parse(fetched.body));
    } catch {
      throw new ApiError(502, 'upstream_invalid', 'Upstream returned data that failed validation');
    }
  });
}
