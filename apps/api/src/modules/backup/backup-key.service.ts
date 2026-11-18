import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type BackupKeyReveal,
  type BackupKeyStatus,
  ERROR_CODES,
  type SetBackupKeyRequest,
} from '@scrum/shared';
import { strToU8, zipSync } from 'fflate';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SecretBoxService } from '../../infra/security/secret-box.service';
import { ActivityService } from '../activity/activity.service';
import { fail } from '../work-items/item-support';
import {
  decryptBackup,
  encryptBackup,
  generateBackupKey,
  isEncryptedBackup,
  keyFingerprint,
} from './backup-crypto';

/**
 * Yedek şifreleme anahtarı (ADR-171). Anahtar, sunucu sırrıyla mühürlenip `workspaces` satırında
 * durur; yalnızca Super Admin (Sahip/Yönetici) görür, üretir ve değiştirir. Anahtar yokken ilk
 * yedek alınırsa otomatik üretilir; böylece indirilen her yedek şifrelidir.
 */
@Injectable()
export class BackupKeyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly box: SecretBoxService,
    private readonly activity: ActivityService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  async status(): Promise<BackupKeyStatus> {
    const ws = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: this.ctx.workspaceId },
      select: { backupKeySealed: true, backupKeyFingerprint: true, backupKeyUpdatedAt: true },
    });
    return {
      configured: ws.backupKeySealed !== null,
      fingerprint: ws.backupKeyFingerprint,
      updatedAt: ws.backupKeyUpdatedAt?.toISOString() ?? null,
    };
  }

  /** Anahtarı açık metin olarak döner ve görüntülemeyi denetim günlüğüne yazar. */
  async reveal(): Promise<BackupKeyReveal> {
    const key = await this.currentKey();
    if (!key) throw fail(ERROR_CODES.NOT_FOUND, HttpStatus.NOT_FOUND);
    await this.log('backup_key.viewed', {});
    return { key };
  }

  /**
   * Anahtarı üretir ya da değiştirir. Var olan anahtar değişiyorsa "eski yedekler etkilenebilir"
   * uyarısı `acknowledgeOldBackups` ile onaylanmış olmalıdır.
   */
  async set(input: SetBackupKeyRequest): Promise<BackupKeyStatus> {
    const before = await this.status();
    if (before.configured && input.acknowledgeOldBackups !== true) {
      throw fail(ERROR_CODES.BACKUP_KEY_CHANGE_UNCONFIRMED, HttpStatus.CONFLICT);
    }
    const key = input.key?.trim() || generateBackupKey();
    const fingerprint = keyFingerprint(key);
    await this.prisma.workspace.update({
      where: { id: this.ctx.workspaceId },
      data: {
        backupKeySealed: await this.box.seal(key),
        backupKeyFingerprint: fingerprint,
        backupKeyUpdatedAt: new Date(),
      },
    });
    await this.log(before.configured ? 'backup_key.changed' : 'backup_key.created', {
      fingerprint: { from: before.fingerprint, to: fingerprint },
    });
    return this.status();
  }

  /** Geçerli anahtar; yoksa `null` (açığa çıkarılamıyorsa da `null`: sunucu sırrı değişmiş). */
  private async currentKey(): Promise<string | null> {
    const ws = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: this.ctx.workspaceId },
      select: { backupKeySealed: true },
    });
    return ws.backupKeySealed ? this.box.open(ws.backupKeySealed) : null;
  }

  /** Anahtar yoksa üretir; yedek şifrelemede kullanılır. */
  private async keyOrCreate(): Promise<string> {
    const existing = await this.currentKey();
    if (existing) return existing;
    await this.set({});
    return (await this.currentKey())!;
  }

  /** Yedek dosyasını geçerli anahtarla şifreler. */
  async seal(file: Buffer): Promise<Buffer> {
    return encryptBackup(file, await this.keyOrCreate());
  }

  /**
   * Geri yüklenecek dosyayı açar: şifresizse (eski yedekler) olduğu gibi döner; şifreliyse geçerli
   * anahtarla çözülür, tutmazsa `BACKUP_KEY_MISMATCH` (yedek eski bir anahtarla alınmıştır).
   */
  async open(file: Buffer | undefined): Promise<Buffer | undefined> {
    if (!file || !isEncryptedBackup(file)) return file;
    const key = await this.currentKey();
    const plain = key ? decryptBackup(file, key) : null;
    if (!plain) throw fail(ERROR_CODES.BACKUP_KEY_MISMATCH, HttpStatus.UNPROCESSABLE_ENTITY);
    return plain;
  }

  /**
   * Eski anahtarla (ya da hiç şifrelenmemiş) alınmış yedekleri geçerli anahtarla yeniden
   * şifreler ve tek bir ZIP olarak döner. Eski anahtar yalnızca bu istekte kullanılır, saklanmaz.
   */
  async reencrypt(
    files: { name: string; data: Buffer }[],
    oldKey: string | undefined,
  ): Promise<Buffer> {
    if (files.length === 0) throw fail(ERROR_CODES.BACKUP_INVALID);
    const key = await this.keyOrCreate();
    const out: Record<string, Uint8Array> = {};
    const bad: string[] = [];
    for (const file of files) {
      let plain: Buffer | null = file.data;
      if (isEncryptedBackup(file.data)) {
        // Önce verilen eski anahtar, olmazsa geçerli anahtar (zaten güncel olan dosya) denenir.
        plain = (oldKey ? decryptBackup(file.data, oldKey) : null) ?? decryptBackup(file.data, key);
      }
      if (!plain) {
        bad.push(file.name);
        continue;
      }
      const base = file.name.replace(/\.(zip\.enc|enc|zip)$/i, '');
      out[`${base}.zip.enc`] = new Uint8Array(encryptBackup(plain, key));
    }
    if (bad.length > 0) {
      throw fail(ERROR_CODES.BACKUP_KEY_MISMATCH, HttpStatus.UNPROCESSABLE_ENTITY, { files: bad });
    }
    await this.log('backup_key.reencrypted', { files: files.length });
    return Buffer.from(
      zipSync({ ...out, 'OKUBENI.txt': strToU8('Seyir yeniden şifrelenmiş yedekler.\n') }),
    );
  }

  private async log(action: string, changes: Record<string, unknown>): Promise<void> {
    await this.activity.record(this.prisma, {
      workspaceId: this.ctx.workspaceId,
      actorId: this.ctx.actorId,
      entityType: 'workspace',
      entityId: this.ctx.workspaceId,
      action,
      changes: changes as never,
    });
  }
}
