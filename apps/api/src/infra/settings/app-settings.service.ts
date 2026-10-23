import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppUrlSettings } from '@scrum/shared';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/** Sondaki eğik çizgi atılır: `https://seyir.firma.com/` → `https://seyir.firma.com`. */
const clean = (url: string) => url.trim().replace(/\/+$/, '');

/**
 * Uygulamanın dışarıdan görünen adresi (ADR-122): e-postalardaki davet, şifre sıfırlama ve
 * bildirim bağlantıları bununla kurulur. Ayarlar → Genel'de girilmişse o, yoksa `APP_URL` (.env).
 * Gönderim başına tek anahtar sorgusu; önbellek yok, değişiklik hemen geçerli olur.
 */
@Injectable()
export class AppSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Bağlantı kurarken kullanılacak adres (sonunda `/` yok). */
  async publicUrl(): Promise<string> {
    const row = await this.prisma.appSettings.findUnique({ where: { id: 1 } });
    return clean(row?.publicUrl ?? this.config.get('APP_URL', { infer: true }));
  }

  async view(): Promise<AppUrlSettings> {
    const row = await this.prisma.appSettings.findUnique({ where: { id: 1 } });
    return {
      url: clean(row?.publicUrl ?? this.config.get('APP_URL', { infer: true })),
      custom: Boolean(row?.publicUrl),
    };
  }

  /** `null`: kaydı siler, `.env` değerine dönülür. Adres `http(s)://` ile başlamalı (şema doğrular). */
  async save(url: string | null): Promise<void> {
    if (url === null) {
      // Satır silinmez: aynı satırda başka ayarlar (çağrı gelen kutusu başlangıcı) da durur.
      await this.prisma.appSettings.updateMany({ where: { id: 1 }, data: { publicUrl: null } });
      return;
    }
    const publicUrl = clean(url);
    await this.prisma.appSettings.upsert({
      where: { id: 1 },
      create: { id: 1, publicUrl },
      update: { publicUrl },
    });
  }
}
