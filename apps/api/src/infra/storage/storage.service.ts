import { randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, open, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

/**
 * Dosya depolama soyutlaması (ADR-056). Varsayılan yerel disk; S3 adaptörü aynı arayüzle eklenebilir.
 * Anahtarlar sunucuda üretilir (`<önek>/<uuid>`); istemci girdisi dosya yoluna hiç girmez.
 */
@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(config: ConfigService<Env, true>) {
    this.root = resolve(config.get('UPLOAD_DIR', { infer: true }));
  }

  /** Verilen önek altında rastgele anahtarla kaydeder (ör. `workspaceId`). */
  async put(prefix: string, data: Buffer): Promise<string> {
    const key = `${prefix}/${randomUUID()}`;
    await this.write(key, data);
    return key;
  }

  /** Sabit anahtara yazar/değiştirir (profil fotoğrafı: `avatars/<userId>`). */
  async write(key: string, data: Buffer): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  open(key: string): ReadStream {
    return createReadStream(this.pathOf(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await stat(this.pathOf(key))).isFile();
    } catch {
      return false;
    }
  }

  /** Dosyanın ilk `bytes` baytı (içerik imzası için). */
  async head(key: string, bytes: number): Promise<Uint8Array> {
    const handle = await open(this.pathOf(key), 'r');
    try {
      const buffer = Buffer.alloc(bytes);
      const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  /** Dosya yoksa sessizce geçer. */
  async remove(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  /** Anahtarı kök dizin içinde çözer; dışarı çıkan yolu (`..`) reddeder. */
  private pathOf(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error('Geçersiz depolama anahtarı');
    return path;
  }
}
