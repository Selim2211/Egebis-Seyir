import { randomBytes } from 'node:crypto';
import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { WORKSPACE_PERMISSIONS as W } from '@scrum/shared';
import type { Request, Response } from 'express';
import { RequirePermission } from '../auth/decorators';
import { DiagnosticsService } from './diagnostics.service';

/** İndirme testi için en büyük veri (MB). */
const MAX_PAYLOAD_KB = 4096;

/** Ayarlar → Tanılama (ADR-159): yalnızca Super Admin (workspace ayar izni). */
@Controller('workspaces/:workspaceId/diagnostics')
export class DiagnosticsController {
  constructor(private readonly diagnostics: DiagnosticsService) {}

  @Get()
  @RequirePermission(W.WORKSPACE_SETTINGS)
  report(@Req() req: Request) {
    return this.diagnostics.report(req);
  }

  /** Gidiş-dönüş ölçümü: veritabanına dokunmaz, sunucu süresi ~0; kalan süre ağ ve vekildir. */
  @Get('ping')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  ping(@Res() res: Response): void {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ t: Date.now() });
  }

  /**
   * İndirme testi: sıkıştırılamayan rastgele veri. Büyük yanıtların takılması ağda MTU ya da vekil
   * sorununa, düşük hız bant genişliğine işaret eder.
   */
  @Get('payload')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  payload(@Query('kb') kb: string | undefined, @Res() res: Response): void {
    const size = Math.min(Math.max(Number(kb) || 512, 1), MAX_PAYLOAD_KB) * 1024;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(randomBytes(size));
  }
}
