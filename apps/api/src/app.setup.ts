import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';

export const API_PREFIX = 'api';

/** main.ts ve entegrasyon testleri aynı HTTP ayarlarını kullanır. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
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
