import type { IncomingMessage, ServerResponse } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { recordRequest } from './infra/diagnostics/request-stats';

export const API_PREFIX = 'api';

/** main.ts ve entegrasyon testleri aynı HTTP ayarlarını kullanır. */
export function configureApp(app: INestApplication, opts: { trustProxy?: boolean } = {}): void {
  app.setGlobalPrefix(API_PREFIX);
  // Docker ağında ters vekil (Caddy) özel ağ adresinden gelir; gerçek istemci IP'si X-Forwarded-For'dan okunur.
  if (opts.trustProxy) (app as NestExpressApplication).set('trust proxy', 'loopback, uniquelocal');
  app.use(helmet());
  // Sunucuda geçen süre tarayıcının Ağ sekmesinde görünsün (yavaşlık tanısı: ağ mı, sunucu mu) ve
  // Ayarlar → Tanılama için kaydedilsin (ADR-157, ADR-159).
  app.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const start = process.hrtime.bigint();
    const elapsed = () => Number(process.hrtime.bigint() - start) / 1e6;
    const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => ServerResponse;
    res.writeHead = (...args: unknown[]) => {
      if (!res.headersSent) res.setHeader('Server-Timing', `app;dur=${elapsed().toFixed(1)}`);
      return writeHead(...args);
    };
    res.on('finish', () => recordRequest(req.url ?? '', elapsed(), res.statusCode));
    next();
  });
  app.use(cookieParser());
  // CSV içe aktarma gövdesi büyük olabilir (ADR-085): JSON sınırı 100 KB yerine 6 MB (içe aktarma ayrıca 5 MB ile sınırlı).
  // Ham gövde, Git webhook imzasının doğrulanması için saklanır (ADR-089).
  (app as NestExpressApplication).useBodyParser('json', {
    limit: '6mb',
    verify: (req: object, _res: unknown, buf: Buffer) => {
      (req as { rawBody?: Buffer }).rawBody = buf;
    },
  });
  app.enableShutdownHooks();
}

/** OpenAPI dokümanı: /api/docs (yalnızca production dışı). */
export function setupOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Egebis Seyir API')
    .setVersion(process.env.npm_package_version ?? 'dev')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, cleanupOpenApiDoc(document));
}
