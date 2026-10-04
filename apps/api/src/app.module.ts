import { randomUUID } from 'node:crypto';
import { type ExecutionContext, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { validateEnv, type Env } from './infra/config/env';
import { ApiExceptionFilter } from './infra/http/api-exception.filter';
import { MailModule } from './infra/mail/mail.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { QueueModule } from './infra/queue/queue.module';
import { StorageModule } from './infra/storage/storage.module';
import { AccessModule } from './modules/access/access.module';
import { ActivityModule } from './modules/activity/activity.module';
import { AuthModule } from './modules/auth/auth.module';
import { AUTH_RATE_LIMITED } from './modules/auth/decorators';
import {
  AuthGuard,
  CsrfGuard,
  PermissionGuard,
  SpacePermissionGuard,
  WorkspaceAccessGuard,
} from './modules/auth/guards';
import { HealthModule } from './modules/health/health.module';
import { CollabModule } from './modules/collab/collab.module';
import { SetupModule } from './modules/setup/setup.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DocsModule } from './modules/docs/docs.module';
import { TimeModule } from './modules/time/time.module';
import { ViewsModule } from './modules/views/views.module';
import { SprintsModule } from './modules/sprints/sprints.module';
import { SpacesModule } from './modules/spaces/spaces.module';
import { UsersModule } from './modules/users/users.module';
import { WorkItemsModule } from './modules/work-items/work-items.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';

const requestId = (req: Request): string => {
  const header = req.headers['x-request-id'];
  return typeof header === 'string' && header.length > 0 ? header : randomUUID();
};

const isAuthRateLimited = (ctx: ExecutionContext): boolean =>
  Reflect.getMetadata(AUTH_RATE_LIMITED, ctx.getHandler()) === true;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // İstek bağlamı (ADR-012): requestId, userId, workspaceId, izinler.
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true, generateId: true, idGenerator: requestId },
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          genReqId: (req) => requestId(req as Request),
          redact: ['req.headers.cookie', 'res.headers["set-cookie"]'],
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          { name: 'default', ttl: 60_000, limit: 600 },
          {
            name: 'auth',
            ttl: 60_000,
            limit: config.get('AUTH_RATE_LIMIT', { infer: true }),
            skipIf: (ctx) => !isAuthRateLimited(ctx),
          },
        ],
      }),
    }),
    PrismaModule,
    QueueModule,
    StorageModule,
    MailModule,
    ActivityModule,
    AccessModule,
    AuthModule,
    SetupModule,
    UsersModule,
    WorkspacesModule,
    SpacesModule,
    WorkItemsModule,
    SprintsModule,
    DocsModule,
    TimeModule,
    ViewsModule,
    NotificationsModule,
    CollabModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    // Guard sırası önemli: oran sınırı → oturum → CSRF → workspace üyeliği → izin → Space izni.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: WorkspaceAccessGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: SpacePermissionGuard },
  ],
})
export class AppModule {}
