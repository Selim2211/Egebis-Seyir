import { randomBytes } from 'node:crypto';
import { Injectable, StreamableFile } from '@nestjs/common';
import { checkAvatar, ERROR_CODES, sniffMime } from '@scrum/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { StorageService } from '../../infra/storage/storage.service';
import { fail } from '../work-items/item-support';
import { notFound } from '../spaces/space-errors';

const keyOf = (userId: string) => `avatars/${userId}`;

/** Profil fotoğrafı (ADR-059): yükleme, silme ve aynı workspace'tekilere sunum. */
@Injectable()
export class AvatarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Yeni fotoğrafı yazar; önbellek anahtarı olan sürüm döner. */
  async set(userId: string, file: Express.Multer.File | undefined): Promise<string> {
    if (!file || !checkAvatar(file.buffer).ok) throw fail(ERROR_CODES.AVATAR_INVALID, 422);
    await this.storage.write(keyOf(userId), file.buffer);
    const version = randomBytes(6).toString('hex');
    await this.prisma.user.update({ where: { id: userId }, data: { avatarVersion: version } });
    return version;
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { avatarVersion: null } });
    await this.storage.remove(keyOf(userId));
  }

  /** Yalnızca kendisi veya en az bir ortak workspace'i olan oturum sahipleri görebilir. */
  async open(viewerId: string, targetId: string): Promise<StreamableFile> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { avatarVersion: true },
    });
    if (!target?.avatarVersion || !(await this.storage.exists(keyOf(targetId)))) throw notFound();
    if (viewerId !== targetId) {
      const shared = await this.prisma.membership.findFirst({
        where: {
          userId: viewerId,
          workspace: { memberships: { some: { userId: targetId } } },
        },
        select: { id: true },
      });
      if (!shared) throw notFound();
    }
    const mime =
      sniffMime(await this.storage.head(keyOf(targetId), 16)) ?? 'application/octet-stream';
    return new StreamableFile(this.storage.open(keyOf(targetId)), { type: mime });
  }
}
