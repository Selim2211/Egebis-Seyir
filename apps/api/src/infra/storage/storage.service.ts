import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, type ReadStream } from 'node:fs';
import { mkdir, open, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
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

  /** Dosyanın `start`–`end` (dahil) bayt aralığı: video oynatıcının ileri sarması için (HTTP Range). */
  openRange(key: string, start: number, end: number): ReadStream {
    return createReadStream(this.pathOf(key), { start, end });
  }

  /** Dosya boyutu (bayt); dosya yoksa 0. */
  async size(key: string): Promise<number> {
    try {
      return (await stat(this.pathOf(key))).size;
    } catch {
      return 0;
    }
  }

  /**
   * Akışı dosyanın sonuna ekler (parça parça büyük dosya yükleme). Bellekte tutulmaz; `maxBytes` aşılırsa
   * akış kesilir ve `StorageLimitError` fırlar (o ana kadar yazılanlar çağıran tarafından geri alınır).
   * Dönen değer bu çağrıda yazılan bayt sayısıdır.
   */
  async append(key: string, source: Readable, maxBytes: number): Promise<number> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    let written = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _enc, done) {
        written += chunk.length;
        if (written > maxBytes) done(new StorageLimitError());
        else done(null, chunk);
      },
    });
    await pipeline(source, limit, createWriteStream(path, { flags: 'a' }));
    return written;
  }

  /** Dosyayı verilen boyuta keser (yarım kalan parçayı geri almak için). */
  async truncate(key: string, size: number): Promise<void> {
    const handle = await open(this.pathOf(key), 'r+');
    try {
      await handle.truncate(size);
    } finally {
      await handle.close();
    }
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

/** `append` sınırı aşıldı. */
export class StorageLimitError extends Error {
  constructor() {
    super('Depolama sınırı aşıldı');
  }
}
