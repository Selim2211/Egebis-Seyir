import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { cookieSecure, type Env } from '../../infra/config/env';
import { generateToken } from '../../infra/security/tokens';
import { CSRF_COOKIE } from './auth.constants';

/** CSRF cookie'si yoksa üretir. Web uygulaması bu değeri okuyup başlıkta geri gönderir. */
@Injectable()
export class CsrfCookieMiddleware implements NestMiddleware {
  private readonly secure: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.secure = cookieSecure({
      COOKIE_SECURE: config.get('COOKIE_SECURE', { infer: true }),
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
    });
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const existing = (req.cookies as Record<string, unknown> | undefined)?.[CSRF_COOKIE];
    if (typeof existing !== 'string' || existing.length === 0) {
      const token = generateToken();
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: false,
        sameSite: 'lax',
        secure: this.secure,
        path: '/',
      });
      // Aynı istekte CSRF kontrolü yapılırsa (ilk POST) yine başarısız olur; bu beklenen davranış.
    }
    next();
  }
}
