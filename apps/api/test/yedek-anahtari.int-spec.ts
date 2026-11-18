import type { BackupKeyReveal, BackupKeyStatus, Created } from '@scrum/shared';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  decryptBackup,
  isEncryptedBackup,
  keyFingerprint,
} from '../src/modules/backup/backup-crypto';
import {
  type Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass-123' };

/** Yedek şifreleme anahtarı (ADR-171): AES-256, yalnızca Super Admin görür; değişirse uyarı onaylanır. */
describe('Yedek şifreleme anahtarı', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    ({ owner, workspaceId: ws } = await setupOwner(ctx));
  });

  const key = async () =>
    ((await owner.get(api('/backup-key/reveal')).expect(200)).body as BackupKeyReveal).key;
  const status = async () =>
    (await owner.get(api('/backup-key')).expect(200)).body as BackupKeyStatus;
  const spaceBackup = async (spaceId: string) =>
    (await owner.download(api(`/spaces/${spaceId}/backup.zip`)).expect(200)).body as Buffer;

  async function space() {
    return (
      (await owner.post(api('/spaces'), { name: 'MOB', key: 'MOB', color: '#7C3AED' }).expect(201))
        .body as Created
    ).id;
  }

  it('anahtar yokken ilk yedekte otomatik üretilir; yedek AES-256 ile şifrelidir', async () => {
    expect((await status()).configured).toBe(false);
    const spaceId = await space();
    const file = await spaceBackup(spaceId);
    expect(isEncryptedBackup(file)).toBe(true);

    const s = await status();
    expect(s.configured).toBe(true);
    expect(s.fingerprint).toBe(keyFingerprint(await key()));
    expect(decryptBackup(file, await key())).not.toBeNull();
    // Anahtar sunucu sırrıyla mühürlüdür; veritabanında açık metin durmaz.
    const row = await ctx.prisma.workspace.findUniqueOrThrow({ where: { id: ws } });
    expect(row.backupKeySealed).toBeTruthy();
    expect(row.backupKeySealed).not.toContain(await key());
  });

  it('anahtarı yalnızca Super Admin görür ve değiştirir', async () => {
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await elif.get(api('/backup-key')).expect(403);
    await elif.get(api('/backup-key/reveal')).expect(403);
    await elif.put(api('/backup-key'), { acknowledgeOldBackups: true }).expect(403);
  });

  it('Super Admin kendi anahtarını girebilir; çok kısa anahtar reddedilir', async () => {
    await owner.put(api('/backup-key'), { key: 'kisa' }).expect(400);
    const mine = 'benim-ozel-anahtarim-2026';
    await owner.put(api('/backup-key'), { key: mine }).expect(200);
    expect(await key()).toBe(mine);
  });

  it('anahtarı değiştirmek uyarının onaylanmasını ister; eski yedek yeni anahtarla açılmaz', async () => {
    const spaceId = await space();
    const oldFile = await spaceBackup(spaceId);
    const oldKey = await key();

    const refused = await owner.put(api('/backup-key'), {}).expect(409);
    expect((refused.body as { code: string }).code).toBe('BACKUP_KEY_CHANGE_UNCONFIRMED');
    expect(await key()).toBe(oldKey);

    await owner.put(api('/backup-key'), { acknowledgeOldBackups: true }).expect(200);
    const newKey = await key();
    expect(newKey).not.toBe(oldKey);

    // Eski yedek artık geçerli anahtarla çözülemez.
    const res = await owner
      .upload(api('/restore/space'), oldFile, 'eski.zip.enc', { key: 'MOB9' })
      .expect(422);
    expect((res.body as { code: string }).code).toBe('BACKUP_KEY_MISMATCH');
  });

  it('eski yedekler seçilip yeni anahtarla yeniden şifrelenir ve geri yüklenebilir', async () => {
    const spaceId = await space();
    const oldFile = await spaceBackup(spaceId);
    const oldKey = await key();
    await owner.put(api('/backup-key'), { acknowledgeOldBackups: true }).expect(200);
    const newKey = await key();

    // Yanlış eski anahtar: hiçbir şey üretilmez.
    const wrong = await owner
      .uploadMany(api('/backup-key/reencrypt'), [{ buffer: oldFile, name: 'MOB-yedek.zip.enc' }], {
        oldKey: 'yanlis-anahtar-yanlis-anahtar',
      })
      .expect(422);
    expect((wrong.body as { code: string }).code).toBe('BACKUP_KEY_MISMATCH');

    const res = await owner
      .uploadMany(api('/backup-key/reencrypt'), [{ buffer: oldFile, name: 'MOB-yedek.zip.enc' }], {
        oldKey,
      })
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const out = unzipSync(new Uint8Array(res.body as Buffer));
    expect(Object.keys(out)).toContain('MOB-yedek.zip.enc');
    const reencrypted = Buffer.from(out['MOB-yedek.zip.enc']!);
    expect(decryptBackup(reencrypted, newKey)).not.toBeNull();
    expect(decryptBackup(reencrypted, oldKey)).toBeNull();
    expect(strFromU8(out['OKUBENI.txt']!)).toContain('Seyir');

    await owner
      .upload(api('/restore/space'), reencrypted, 'MOB-yedek.zip.enc', { key: 'MOB7' })
      .expect(200);
  });

  it('şifresiz eski ZIP yedekleri hâlâ geri yüklenebilir ve yeniden şifrelenebilir', async () => {
    const spaceId = await space();
    const plain = decryptBackup(await spaceBackup(spaceId), await key())!;
    await owner.upload(api('/restore/space'), plain, 'eski.zip', { key: 'MOB5' }).expect(200);
  });

  it('anahtar değişimi, görüntüleme ve oluşturma denetim günlüğüne düşer', async () => {
    await owner.put(api('/backup-key'), {}).expect(200);
    await key();
    await owner.put(api('/backup-key'), { acknowledgeOldBackups: true }).expect(200);
    const actions = (
      await ctx.prisma.activityEvent.findMany({
        where: { workspaceId: ws, action: { startsWith: 'backup_key.' } },
        select: { action: true },
      })
    ).map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(['backup_key.created', 'backup_key.viewed', 'backup_key.changed']),
    );
  });
});
