import { expect, test, type APIRequestContext } from '@playwright/test';

interface OpenApiDocument {
  security?: unknown[];
  paths: Record<string, Record<string, { security?: unknown[] }>>;
}

const SHADOW_PATHS = [
  '/debug/config',
  '/debug/routes',
  '/debug/env',
  '/actuator/env',
  '/.env',
  '/internal/metrics',
  '/swagger.json',
  '/api/swagger.json',
];

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

async function loadSpec(request: APIRequestContext): Promise<OpenApiDocument> {
  const response = await request.get('/openapi.json');
  expect(response.status()).toBe(200);
  return response.json();
}

const concretePath = (path: string) => path.replace(/\{[^}]+\}/g, '00000000-0000-4000-8000-000000000000');

test.describe('API9:2023 Improper Inventory Management', { tag: '@API9' }, () => {
  test('every documented operation is served', async ({ request }) => {
    const spec = await loadSpec(request);
    const missing: string[] = [];

    for (const [path, operations] of Object.entries(spec.paths)) {
      for (const method of Object.keys(operations).filter((key) => HTTP_METHODS.includes(key))) {
        const response = await request.fetch(concretePath(path), { method });
        if (response.status() === 404) missing.push(`${method.toUpperCase()} ${path}`);
      }
    }

    expect(missing).toEqual([]);
  });

  test('every non-public operation declares bearer security', async ({ request }) => {
    const spec = await loadSpec(request);
    const unprotected: string[] = [];

    for (const [path, operations] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        const security = operation.security ?? spec.security ?? [];
        const isPublic = path === '/health' || path === '/openapi.json' || path.startsWith('/api/v1/auth/');
        if (!isPublic && security.length === 0) unprotected.push(`${method.toUpperCase()} ${path}`);
      }
    }

    expect(unprotected).toEqual([]);
  });

  test('undocumented API versions are not served', async ({ request }) => {
    const spec = await loadSpec(request);
    const versioned = Object.keys(spec.paths).filter((path) => path.startsWith('/api/v1/'));
    const withCollections = new Set(versioned.flatMap((path) => [path, path.replace(/\/[^/]+$/, '')]));
    const exposed: string[] = [];

    for (const path of withCollections) {
      for (const version of ['v0', 'v2', 'beta', 'internal']) {
        const shadow = concretePath(path.replace('/api/v1/', `/api/${version}/`));
        const response = await request.get(shadow);
        if (response.status() !== 404) exposed.push(`${shadow} -> ${response.status()}`);
      }
    }

    expect(exposed).toEqual([]);
  });

  test('debug and framework endpoints are not exposed', async ({ request }) => {
    const exposed: string[] = [];

    for (const path of SHADOW_PATHS) {
      const response = await request.get(path);
      if (response.status() !== 404) exposed.push(`${path} -> ${response.status()}`);
    }

    expect(exposed).toEqual([]);
  });
});
