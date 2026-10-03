import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupOpenApi } from '../src/app.setup';
import { createTestApp, type TestContext } from './helpers';

describe('OpenAPI dokümanı', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  // main.ts açılışta bunu çağırır; JSON Schema'ya çevrilemeyen bir Zod tipi (z.custom gibi)
  // uygulamanın hiç açılmamasına yol açar, entegrasyon testleri ise bunu görmezdi.
  it('tüm şemalar için üretilebilir', () => {
    expect(() => setupOpenApi(ctx.app)).not.toThrow();
  });
});
