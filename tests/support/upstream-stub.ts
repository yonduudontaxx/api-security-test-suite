import { createServer, type ServerResponse } from 'node:http';

const port = Number(process.env.UPSTREAM_PORT ?? 4010);
const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';

const partners: Record<string, (res: ServerResponse) => void> = {
  acme: (res) => sendJson(res, { id: 'acme', name: 'Acme Logistics', website: 'https://acme.example.test', discountPercent: 5 }),
  tampered: (res) =>
    sendJson(res, {
      id: 'tampered',
      name: '<img src=x onerror=alert(document.cookie)>',
      website: 'javascript:alert(1)',
      discountPercent: 250,
      role: 'admin',
    }),
  redirect: (res) => {
    res.writeHead(302, { location: `${apiOrigin}/debug/config` });
    res.end();
  },
  oversized: (res) =>
    sendJson(res, { id: 'oversized', name: 'Bulk', website: 'https://bulk.example.test', discountPercent: 1, blob: 'x'.repeat(2 * 1024 * 1024) }),
  slow: (res) => {
    setTimeout(() => sendJson(res, { id: 'slow', name: 'Slow', website: 'https://slow.example.test', discountPercent: 1 }), 10_000);
  },
};

function sendJson(res: ServerResponse, body: unknown, status = 200): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
  res.end(payload);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  if (url.pathname === '/health') return sendJson(res, { status: 'ok' });
  if (url.pathname === '/files/report.txt') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('quarterly report: all systems nominal\n');
  }
  if (url.pathname === '/redirect') {
    res.writeHead(302, { location: url.searchParams.get('to') ?? '/' });
    return res.end();
  }
  const partner = /^\/partners\/([a-z0-9-]+)$/.exec(url.pathname)?.[1];
  const handler = partner ? partners[partner] : undefined;
  if (handler) return handler(res);
  return sendJson(res, { error: 'not_found' }, 404);
});

server.listen(port, '127.0.0.1', () => console.log(`Upstream stub on http://127.0.0.1:${port}`));
