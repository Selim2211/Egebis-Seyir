import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiRequest, ApiRequestError } from './api';

const Schema = z.object({ ok: z.boolean() });

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
  );
}

describe('apiRequest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('başarılı yanıtı şemaya göre döndürür', async () => {
    mockFetch(200, { ok: true });
    await expect(apiRequest('/x', Schema)).resolves.toEqual({ ok: true });
  });

  it('API hata kodunu ApiRequestError olarak taşır', async () => {
    mockFetch(409, { code: 'SPRINT_ALREADY_ACTIVE', details: { id: 1 } });
    await expect(apiRequest('/x', Schema)).rejects.toMatchObject({
      status: 409,
      code: 'SPRINT_ALREADY_ACTIVE',
      details: { id: 1 },
    });
  });

  it('kabul edilen hata durumunda gövdeyi normal yanıt olarak okur', async () => {
    mockFetch(503, { ok: false });
    await expect(apiRequest('/x', Schema, { acceptStatuses: [503] })).resolves.toEqual({
      ok: false,
    });
  });

  it('ağ hatasında NETWORK kodu verir', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const error = await apiRequest('/x', Schema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 0, code: 'NETWORK' });
  });

  it('beklenmeyen yanıt şemasında hata fırlatır', async () => {
    mockFetch(200, { unexpected: true });
    await expect(apiRequest('/x', Schema)).rejects.toThrow();
  });
});
