import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';

export const API_PREFIX = 'api';

/** main.ts ve entegrasyon testleri aynı HTTP ayarlarını kullanır. */
export function configureApp(app: INestApplication, opts: { trustProxy?: boolean } = {}): void {
  app.setGlobalPrefix(API_PREFIX);
  // Docker ağında ters vekil (Caddy) özel ağ adresinden gelir; gerçek istemci IP'si X-Forwarded-For'dan okunur.
  if (opts.trustProxy) (app as NestExpressApplication).set('trust proxy', 'loopback, uniquelocal');
  app.use(helmet());
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
