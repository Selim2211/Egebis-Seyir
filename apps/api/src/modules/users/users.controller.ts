import { Body, Controller, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  ChangePasswordRequestSchema,
  MeResponseSchema,
  UpdateProfileRequestSchema,
  type MeResponse,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AccessService } from '../access/access.service';
import type { AuthUser } from '../auth/auth.constants';
import { AuthService } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators';

class UpdateProfileDto extends createZodDto(UpdateProfileRequestSchema) {}
class ChangePasswordDto extends createZodDto(ChangePasswordRequestSchema) {}
class MeDto extends createZodDto(MeResponseSchema) {}

/** Oturum açmış kullanıcının kendi profili ve tercihleri (ADR-037). */
@Controller('users/me')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly auth: AuthService,
  ) {}

  @Patch()
  @ZodResponse({ type: MeDto })
  async update(@CurrentUser() user: AuthUser, @Body() body: UpdateProfileDto): Promise<MeResponse> {
    await this.prisma.user.update({ where: { id: user.id }, data: body });
    return this.access.me(user.id);
  }

  /** Şifre değişince bu oturum dışındaki tüm oturumlar kapanır. */
  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() body: ChangePasswordDto,
  ): Promise<void> {
    await this.auth.changePassword(user.id, user.sessionId, body.currentPassword, body.newPassword);
  }
}
