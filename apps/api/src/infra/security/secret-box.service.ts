import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { openWith, sealWith } from './secret-box';

/**
 * Veritabanında saklanan gizli değerleri (SMTP şifresi) şifreler (ADR-120). Anahtar veritabanında
 * durmaz: `SETTINGS_SECRET` verilmişse ondan türetilir, yoksa ilk kullanımda üretilip
 * `UPLOAD_DIR/.secrets/settings.key` (yalnız sahibi okur) dosyasına yazılır. Böylece veritabanı
 * dökümü tek başına şifreyi ele vermez; anahtar dosyası dosya yedeğiyle birlikte taşınır.
 */
@Injectable()
export class SecretBoxService {
  private key?: Promise<Buffer>;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async seal(plain: string): Promise<string> {
    return sealWith(await this.loadKey(), plain);
  }

  /** Çözülemezse (anahtar kaybolmuş/değişmiş) `null`: çağıran şifreyi yeniden istemelidir. */
  async open(sealed: string): Promise<string | null> {
    try {
      return openWith(await this.loadKey(), sealed);
    } catch {
      return null;
    }
  }

  private loadKey(): Promise<Buffer> {
    this.key ??= (async () => {
      const fromEnv = this.config.get('SETTINGS_SECRET', { infer: true });
      if (fromEnv) return createHash('sha256').update(fromEnv).digest();
      const file = resolve(this.config.get('UPLOAD_DIR', { infer: true }), '.secrets/settings.key');
      try {
        return Buffer.from((await readFile(file, 'utf8')).trim(), 'base64url');
      } catch {
        const created = randomBytes(32);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, created.toString('base64url'), { mode: 0o600, flag: 'wx' }).catch(
          () => undefined,
        );
        // Başka bir süreç aynı anda yazmış olabilir; diskteki değer geçerlidir.
        return Buffer.from((await readFile(file, 'utf8')).trim(), 'base64url');
      }
    })();
    return this.key;
  }
}
