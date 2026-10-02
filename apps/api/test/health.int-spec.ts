import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthResponseSchema } from '@scrum/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('GET /api/health (gerçek veritabanı)', () => {
  let app: INestApplication;
  let http: Parameters<typeof request>[0];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    http = app.getHttpServer() as typeof http;
  });

  afterAll(async () => {
    await app.close();
  });

  it('veritabanı ayaktayken 200 ve şemaya uygun yanıt döner', async () => {
    const res = await request(http).get('/api/health').expect(200);
    const body = HealthResponseSchema.parse(res.body);
    expect(body).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('güvenlik başlıkları (helmet) eklenir', async () => {
    const res = await request(http).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('bilinmeyen uç ortak hata biçiminde 404 döner', async () => {
    const res = await request(http).get('/api/nope').expect(404);
    expect(res.body).toEqual({ code: 'NOT_FOUND' });
  });
});
