import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ERROR_CODES,
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  MeResponseSchema,
  ResetPasswordRequestSchema,
  SessionsResponseSchema,
  type MeResponse,
  type SessionsResponse,
} from '@scrum/shared';
import type { Request, Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { AccessService } from '../access/access.service';
import type { AuthUser } from './auth.constants';
import { AuthService } from './auth.service';
import { AuthRateLimit, CurrentUser, Public } from './decorators';
import { SessionService } from './session.service';

class LoginDto extends createZodDto(LoginRequestSchema) {}
class ForgotDto extends createZodDto(ForgotPasswordRequestSchema) {}
class ResetDto extends createZodDto(ResetPasswordRequestSchema) {}
class MeDto extends createZodDto(MeResponseSchema) {}
class SessionsDto extends createZodDto(SessionsResponseSchema) {}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly access: AccessService,
  ) {}

  @Public()
  @AuthRateLimit()
  @Post('login')
  @ZodResponse({ type: MeDto, status: HttpStatus.OK })
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const userId = await this.auth.verifyCredentials(body.email, body.password);
    await this.sessions.start(res, req, userId, body.remember);
    return this.access.me(userId);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.end(res, user.sessionId);
  }

  @Get('me')
  @ZodResponse({ type: MeDto })
  me(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    return this.access.me(user.id);
  }

  @Get('sessions')
  @ZodResponse({ type: SessionsDto })
  async listSessions(@CurrentUser() user: AuthUser): Promise<SessionsResponse> {
    return { sessions: await this.sessions.list(user.id, user.sessionId) };
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    if (!(await this.sessions.revoke(user.id, id)))
      throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND });
  }

  @Public()
  @AuthRateLimit()
  @Post('password/forgot')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgot(@Body() body: ForgotDto): Promise<void> {
    await this.auth.requestPasswordReset(body.email);
  }

  @Public()
  @AuthRateLimit()
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset(@Body() body: ResetDto): Promise<void> {
    await this.auth.resetPassword(body.token, body.password);
  }
}
