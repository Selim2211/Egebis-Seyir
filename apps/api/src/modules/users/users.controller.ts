import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ChangePasswordRequestSchema,
  MAX_AVATAR_BYTES,
  MeResponseSchema,
  UpdateProfileRequestSchema,
  type MeResponse,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { AvatarService } from './avatar.service';
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

/** Profil fotoğrafı (ADR-059). */
@Controller('users')
export class AvatarController {
  constructor(
    private readonly avatars: AvatarService,
    private readonly access: AccessService,
  ) {}

  /** Yeni fotoğraf; güncel kullanıcı bilgisi döner. */
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } }))
  @ZodResponse({ type: MeDto, status: HttpStatus.OK })
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<MeResponse> {
    await this.avatars.set(user.id, file);
    return this.access.me(user.id);
  }

  @Delete('me/avatar')
  @ZodResponse({ type: MeDto })
  async remove(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    await this.avatars.clear(user.id);
    return this.access.me(user.id);
  }

  /** Fotoğraf sürümü adreste olduğu için tarayıcı uzun süre önbelleğe alabilir. */
  @Get(':userId/avatar')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  @Header('Cache-Control', 'private, max-age=86400')
  get(
    @CurrentUser() viewer: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<StreamableFile> {
    return this.avatars.open(viewer.id, userId);
  }
}
