import type { Created, VideosResponse } from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const VIEWER = { email: 'izleyici@example.com', name: 'İzleyici', password: 'viewer-pass' };

/** Geçerli MP4 başlığı ('ftyp') + gövde. */
const mp4 = (size: number) => {
  const data = Buffer.alloc(size, 7);
  Buffer.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]).copy(data);
  return data;
};

describe('Video arşivi (gerçek veritabanı, ADR-129)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  let spaceId: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;
  const list = async (client = owner) =>
    (await client.get(api(`/spaces/${spaceId}/videos`)).expect(200)).body as VideosResponse;
  const start = async (body: Record<string, unknown>) =>
    (await owner.post(api(`/spaces/${spaceId}/videos`), body).expect(201)).body as Created;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    ({ owner, workspaceId: ws } = await setupOwner(ctx));
    spaceId = (
      (
        await owner
          .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' })
          .expect(201)
      ).body as Created
    ).id;
  });

  it('parça parça yüklenir, kaldığı yerden devam eder, tamamlanınca Range ile oynatılır', async () => {
    const data = mp4(3000);
    const v = await start({ title: 'Demo', fileName: 'demo.mp4', size: data.length });
    expect((await list()).videos[0]).toMatchObject({ status: 'UPLOADING', received: 0 });

    // Erken tamamlama ve yanlış ofset reddedilir; doğru ofset döner.
    await owner.post(api(`/videos/${v.id}/complete`)).expect(409);
    await owner.putRaw(api(`/videos/${v.id}/content?offset=0`), data.subarray(0, 1000)).expect(200);
    const wrong = await owner
      .putRaw(api(`/videos/${v.id}/content?offset=0`), data.subarray(0, 1000))
      .expect(409);
    expect(wrong.body).toMatchObject({ code: 'VIDEO_UPLOAD_OFFSET', details: { received: 1000 } });
    // Oynatılamaz (henüz yükleniyor).
    await owner.get(api(`/videos/${v.id}/stream`)).expect(409);

    const rest = await owner
      .putRaw(api(`/videos/${v.id}/content?offset=1000`), data.subarray(1000))
      .expect(200);
    expect(rest.body).toEqual({ received: 3000 });
    await owner.post(api(`/videos/${v.id}/complete`)).expect(204);
    expect((await list()).videos[0]).toMatchObject({
      status: 'READY',
      size: 3000,
      mime: 'video/mp4',
    });

    const full = await owner.download(api(`/videos/${v.id}/stream`)).expect(200);
    expect(full.headers['accept-ranges']).toBe('bytes');
    expect(Buffer.compare(full.body as Buffer, data)).toBe(0);

    const part = await owner
      .download(api(`/videos/${v.id}/stream`))
      .set('Range', 'bytes=100-199')
      .expect(206);
    expect(part.headers['content-range']).toBe('bytes 100-199/3000');
    expect(Buffer.compare(part.body as Buffer, data.subarray(100, 200))).toBe(0);
    await owner
      .get(api(`/videos/${v.id}/stream`))
      .set('Range', 'bytes=5000-')
      .expect(416);
  });

  it('desteklenmeyen tür, fazla bayt ve sahte içerik reddedilir', async () => {
    await owner
      .post(api(`/spaces/${spaceId}/videos`), { title: 'X', fileName: 'x.mkv', size: 10 })
      .expect(422);
    const v = await start({ title: 'Kısa', fileName: 'kisa.mp4', size: 100 });
    await owner.putRaw(api(`/videos/${v.id}/content?offset=0`), Buffer.alloc(200)).expect(413);
    expect((await list()).videos[0]!.received).toBe(0);

    const fake = await start({ title: 'Sahte', fileName: 'sahte.mp4', size: 20 });
    await owner
      .putRaw(
        api(`/videos/${fake.id}/content?offset=0`),
        Buffer.from('<html><script>x</script>'.slice(0, 20)),
      )
      .expect(200);
    const res = await owner.post(api(`/videos/${fake.id}/complete`)).expect(422);
    expect(res.body).toMatchObject({ code: 'VIDEO_INVALID' });
    expect((await list()).videos.map((x) => x.title)).toEqual(['Kısa']);
  });

  it('klasörler: oluştur, yeniden adlandır, videoyu taşı; klasör silinince video köke düşer', async () => {
    const folder = (
      await owner.post(api(`/spaces/${spaceId}/video-folders`), { name: 'Eğitim' }).expect(201)
    ).body as Created;
    const sub = (
      await owner
        .post(api(`/spaces/${spaceId}/video-folders`), { name: 'Toplantılar', parentId: folder.id })
        .expect(201)
    ).body as Created;
    await owner.patch(api(`/video-folders/${folder.id}`), { name: 'Eğitimler' }).expect(204);
    const v = await start({ title: 'Kayıt', fileName: 'k.webm', size: 10, folderId: sub.id });
    await owner
      .patch(api(`/videos/${v.id}`), { title: 'Sprint 3 demo', description: 'Notlar' })
      .expect(204);

    let state = await list();
    expect(state.folders.map((f) => f.name).sort()).toEqual(['Eğitimler', 'Toplantılar']);
    expect(state.videos[0]).toMatchObject({
      title: 'Sprint 3 demo',
      folderId: sub.id,
      mime: 'video/webm',
    });

    await owner.delete(api(`/video-folders/${folder.id}`)).expect(204);
    state = await list();
    expect(state.folders).toEqual([]);
    expect(state.videos[0]!.folderId).toBeNull();

    await owner.delete(api(`/videos/${v.id}`)).expect(204);
    expect((await list()).videos).toEqual([]);
  });

  it('izleyici listeyi görür ama yükleyemez', async () => {
    const viewer = await inviteAndAccept(ctx, owner, ws, VIEWER, 'GUEST', [spaceId]);
    await viewer.get(api(`/spaces/${spaceId}/videos`)).expect(200);
    await viewer
      .post(api(`/spaces/${spaceId}/videos`), { title: 'X', fileName: 'x.mp4', size: 10 })
      .expect(403);
  });
});
