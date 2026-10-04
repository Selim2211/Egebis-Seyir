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
  if (opts.trustProxy) (app as NestExpressApplication).set('trust proxy', 'loopback');
  app.use(helmet());
  app.use(cookieParser());
  // CSV içe aktarma gövdesi büyük olabilir (ADR-085): JSON sınırı 100 KB yerine 6 MB (içe aktarma ayrıca 5 MB ile sınırlı).
  (app as NestExpressApplication).useBodyParser('json', { limit: '6mb' });
  app.enableShutdownHooks();
}

/** OpenAPI dokümanı: /api/docs (yalnızca production dışı). */
export function setupOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Scrum Manager API')
    .setVersion(process.env.npm_package_version ?? 'dev')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, cleanupOpenApiDoc(document));
}
