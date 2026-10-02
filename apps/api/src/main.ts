import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp, setupOpenApi } from './app.setup';
import type { Env } from './infra/config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  configureApp(app, { trustProxy: config.get('TRUST_PROXY', { infer: true }) });

  if (config.get('NODE_ENV', { infer: true }) !== 'production') setupOpenApi(app);

  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
