import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  BackupKeyRevealSchema,
  BackupKeyStatusSchema,
  SetBackupKeyRequestSchema,
  WORKSPACE_PERMISSIONS as W,
  type BackupKeyReveal,
  type BackupKeyStatus,
} from '@scrum/shared';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequirePermission } from '../auth/decorators';
import { BackupKeyService } from './backup-key.service';

class BackupKeyStatusDto extends createZodDto(BackupKeyStatusSchema) {}
class BackupKeyRevealDto extends createZodDto(BackupKeyRevealSchema) {}
class SetBackupKeyDto extends createZodDto(SetBackupKeyRequestSchema) {}

/**
 * Yedek şifreleme anahtarı (ADR-171). Yalnızca Super Admin (Sahip/Yönetici): anahtarı görür,
 * üretir/değiştirir; eski yedekleri yeni anahtarla yeniden şifreler.
 */
@Controller('workspaces/:workspaceId/backup-key')
@RequirePermission(W.WORKSPACE_SETTINGS)
export class BackupKeyController {
  constructor(private readonly keys: BackupKeyService) {}

  @Get()
  @ZodResponse({ type: BackupKeyStatusDto })
  status(): Promise<BackupKeyStatus> {
    return this.keys.status();
  }

  @Get('reveal')
  @Header('Cache-Control', 'private, no-store')
  @ZodResponse({ type: BackupKeyRevealDto })
  reveal(): Promise<BackupKeyReveal> {
    return this.keys.reveal();
  }

  @Put()
  @ZodResponse({ type: BackupKeyStatusDto })
  set(@Body() body: SetBackupKeyDto): Promise<BackupKeyStatus> {
    return this.keys.set(body);
  }

  /** Seçilen eski yedekleri (eski anahtarla ya da şifresiz) yeni anahtarla şifreleyip ZIP döner. */
  @Post('reencrypt')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FilesInterceptor('files', 20))
  async reencrypt(
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body() body: { oldKey?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const zip = await this.keys.reencrypt(
      (files ?? []).map((f) => ({ name: f.originalname, data: f.buffer })),
      typeof body?.oldKey === 'string' && body.oldKey.trim() ? body.oldKey : undefined,
    );
    // Başlıklar yalnızca başarıda yazılır; hata yanıtı JSON kalır.
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'attachment; filename="yeniden-sifrelenmis-yedekler.zip"');
    return new StreamableFile(zip);
  }
}
