import { Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ApiTokensController } from './api-tokens.controller';
import { ApiTokensService } from './api-tokens.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfCookieMiddleware } from './csrf.middleware';
import { SessionService } from './session.service';

@Global()
@Module({
  controllers: [AuthController, ApiTokensController],
  providers: [AuthService, SessionService, ApiTokensService],
  exports: [AuthService, SessionService, ApiTokensService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CsrfCookieMiddleware).forRoutes('{*splat}');
  }
}
