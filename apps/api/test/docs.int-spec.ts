import type {
  Created,
  DocDetail,
  DocsResponse,
  DocVersionDetail,
  DocVersionsResponse,
  RichTextDoc,
  UpdateDocResponse,
} from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LifecycleService } from '../src/modules/spaces/lifecycle.service';
import {
  Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass' };

const text = (value: string): RichTextDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
});

describe('Doküman sayfaları (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async (body: Record<string, unknown> = {}) =>
    (
      await owner
        .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED', ...body })
        .expect(201)
    ).body as Created;
  const doc = async (spaceId: string, body: Record<string, unknown>, client = owner) =>
    (await client.post(api(`/spaces/${spaceId}/docs`), body).expect(201)).body as Created;
  const detail = async (id: string, client = owner) =>
    (await client.get(api(`/docs/${id}`)).expect(200)).body as DocDetail;
  const save = (id: string, body: Record<string, unknown>, client = owner) =>
    client.patch(api(`/docs/${id}`), body);
  const tree = async (spaceId: string) =>
    ((await owner.get(api(`/spaces/${spaceId}/docs`)).expect(200)).body as DocsResponse).docs;
  const trash = async (spaceId: string) =>
    ((await owner.get(api(`/spaces/${spaceId}/docs/trash`)).expect(200)).body as DocsResponse).docs;
  const versions = async (id: string) =>
    ((await owner.get(api(`/docs/${id}/versions`)).expect(200)).body as DocVersionsResponse)
      .versions;

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

  describe('ağaç ve okuma', () => {
    it('sayfalar üst-alt ilişkisiyle oluşur; detay üst sayfaları taşır', async () => {
      const s = await space();
      const root = await doc(s.id, { title: 'Ürün' });
      const child = await doc(s.id, { title: 'PRD', parentId: root.id });
      const leaf = await doc(s.id, { title: 'Kapsam', parentId: child.id });

      const nodes = await tree(s.id);
      expect(nodes.map((n) => n.title)).toEqual(['Ürün', 'PRD', 'Kapsam']);
      expect(nodes.find((n) => n.id === child.id)!.parentId).toBe(root.id);

      const d = await detail(leaf.id);
      expect(d.ancestors.map((a) => a.title)).toEqual(['Ürün', 'PRD']);
      expect(d).toMatchObject({ title: 'Kapsam', content: null, revision: 1, deleted: false });
    });

    it('başlık zorunlu; üst sayfa başka Space’ten olamaz', async () => {
      const a = await space();
      const b = await space({ name: 'Web', key: 'WEB' });
      const other = await doc(b.id, { title: 'Başka' });
      await owner.post(api(`/spaces/${a.id}/docs`), { title: '  ' }).expect(400);
      await owner.post(api(`/spaces/${a.id}/docs`), { title: 'X', parentId: other.id }).expect(422);
    });
  });

  describe('düzenleme ve eşzamanlılık', () => {
    it('görsel düğümü yalnızca bu workspace ek adresini kabul eder', async () => {
      const sp = await space();
      const id = (await doc(sp.id, { title: 'Görsel' })).id;
      const att = (
        await owner
          .upload(
            api(`/docs/${id}/attachments`),
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
            'a.png',
          )
          .expect(201)
      ).body as Created;
      const image = (src: string) => ({
        type: 'doc',
        content: [{ type: 'image', attrs: { src, alt: 'a' } }],
      });
      const ok = `/api/workspaces/${ws}/docs/${id}/attachments/${att.id}?preview=1`;
      await save(id, { revision: 1, content: image(ok) }).expect(200);
      expect((await detail(id)).content).toEqual(image(ok));
      for (const bad of ['https://evil.example/x.png', 'data:image/png;base64,AAAA', `${ok}&x=1`]) {
        const res = await save(id, { revision: 2, content: image(bad) });
        expect(res.status).toBe(400);
      }
    });

    it('içerik ve başlık kaydedilir; her kayıt revision’ı artırır', async () => {
      const s = await space();
      const { id } = await doc(s.id, { title: 'Not' });
      const res = await save(id, { revision: 1, title: 'Toplantı notu', content: text('Merhaba') });
      expect(res.status).toBe(200);
      expect((res.body as UpdateDocResponse).revision).toBe(2);

      const d = await detail(id);
      expect(d).toMatchObject({ title: 'Toplantı notu', revision: 2 });
      expect(d.content).toEqual(text('Merhaba'));
      expect(d.updatedBy?.name).toBeTruthy();
    });

    it('eski revision 409 DOC_CONFLICT verir ve veriyi ezmez', async () => {
      const s = await space();
      const { id } = await doc(s.id, { title: 'Not' });
      await save(id, { revision: 1, content: text('Birinci') }).expect(200);
      const res = await save(id, { revision: 1, content: text('Eski') }).expect(409);
      expect(res.body).toEqual({ code: 'DOC_CONFLICT' });
      expect((await detail(id)).content).toEqual(text('Birinci'));
    });

    it('boş belge null saklanır; geçersiz yapı reddedilir', async () => {
      const s = await space();
      const { id } = await doc(s.id, { title: 'Not', content: text('Dolu') });
      await save(id, {
        revision: 1,
        content: { type: 'doc', content: [{ type: 'script' }] },
      }).expect(400);
      await save(id, {
        revision: 1,
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
      }).expect(200);
      expect((await detail(id)).content).toBeNull();
      await save(id, { revision: 2 }).expect(400);
    });

    it('tablo düğümleri kabul edilir', async () => {
      const s = await space();
      const { id } = await doc(s.id, { title: 'Tablo' });
      const table: RichTextDoc = {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
                  },
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }],
                  },
                ],
              },
            ],
          },
        ],
      };
      await save(id, { revision: 1, content: table }).expect(200);
      expect((await detail(id)).content).toEqual(table);
    });
  });

  describe('sürüm geçmişi (ADR-069)', () => {
    it('aynı yazarın art arda kayıtları tek sürümde birleşir', async () => {
      const s = await space();
      const { id } = await doc(s.id, { title: 'Not' });
      await save(id, { revision: 1, content: text('bir') }).expect(200);
      await save(id, { revision: 2, content: text('iki') }).expect(200);
      const list = await versions(id);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ version: 1, current: true });
    });

    it('süre dolunca yeni sürüm açılır; eski sürüm geri yüklenir', async () => {
      const s = await space();
      const { id } = await doc(s.id, { title: 'İlk başlık' });
      await save(id, { revision: 1, content: text('ilk içerik') }).expect(200);
      // Yazma penceresini kapat: ilk sürüm 1 saat önce kaydedilmiş sayılır.
      await ctx.prisma.docVersion.updateMany({
        where: { docId: id },
        data: { createdAt: new Date(Date.now() - 3_600_000) },
      });
      await save(id, { revision: 2, title: 'Yeni başlık', content: text('yeni içerik') }).expect(
        200,
      );

      const list = await versions(id);
      expect(list.map((v) => v.version)).toEqual([2, 1]);
      expect(list[0]!.current).toBe(true);
      expect(list[1]!.current).toBe(false);

      const old = (await owner.get(api(`/docs/${id}/versions/1`)).expect(200))
        .body as DocVersionDetail;
      expect(old).toMatchObject({ title: 'İlk başlık', current: false });
      expect(old.content).toEqual(text('ilk içerik'));

      const restored = await owner.post(api(`/docs/${id}/versions/1/restore`), {}).expect(201);
      expect((restored.body as UpdateDocResponse).revision).toBe(4);
      const d = await detail(id);
      expect(d.title).toBe('İlk başlık');
      expect(d.content).toEqual(text('ilk içerik'));
      expect((await versions(id)).map((v) => v.version)).toEqual([3, 2, 1]);
    });

    it('bilinmeyen sürüm 404', async () => {
      const s = await space();
      const { id } = await doc(s.id, { title: 'Not' });
      await owner.get(api(`/docs/${id}/versions/9`)).expect(404);
      await owner.post(api(`/docs/${id}/versions/9/restore`), {}).expect(404);
    });
  });

  describe('taşıma', () => {
    it('kardeşler arasında sıralanır ve başka üst sayfaya taşınır', async () => {
      const s = await space();
      const a = await doc(s.id, { title: 'A' });
      const b = await doc(s.id, { title: 'B' });
      const c = await doc(s.id, { title: 'C' });
      await owner.post(api(`/docs/${c.id}/move`), { parentId: null, afterId: null }).expect(204);
      expect((await tree(s.id)).map((n) => n.title)).toEqual(['C', 'A', 'B']);
      await owner.post(api(`/docs/${a.id}/move`), { parentId: null, afterId: b.id }).expect(204);
      expect((await tree(s.id)).map((n) => n.title)).toEqual(['C', 'B', 'A']);

      await owner.post(api(`/docs/${a.id}/move`), { parentId: b.id }).expect(204);
      expect((await tree(s.id)).find((n) => n.id === a.id)!.parentId).toBe(b.id);
    });

    it('kendi alt dalına taşıma ve geçersiz kardeş reddedilir', async () => {
      const s = await space();
      const a = await doc(s.id, { title: 'A' });
      const b = await doc(s.id, { title: 'B', parentId: a.id });
      await owner.post(api(`/docs/${a.id}/move`), { parentId: b.id }).expect(422);
      await owner.post(api(`/docs/${a.id}/move`), { parentId: a.id }).expect(422);
      await owner.post(api(`/docs/${b.id}/move`), { parentId: null, afterId: b.id }).expect(422);
    });
  });

  describe('çöp kutusu', () => {
    it('alt sayfalarla birlikte silinir ve birlikte geri gelir', async () => {
      const s = await space();
      const root = await doc(s.id, { title: 'Kök' });
      const child = await doc(s.id, { title: 'Alt', parentId: root.id });
      await owner.delete(api(`/docs/${root.id}`)).expect(204);

      expect(await tree(s.id)).toEqual([]);
      const bin = await trash(s.id);
      expect(bin.map((n) => n.title)).toEqual(['Kök']);
      expect((await detail(child.id)).deleted).toBe(true);
      await save(child.id, { revision: 1, title: 'X' }).expect(409);

      await owner.post(api(`/docs/${root.id}/restore`), {}).expect(204);
      expect((await tree(s.id)).map((n) => n.title)).toEqual(['Kök', 'Alt']);
      expect(await trash(s.id)).toEqual([]);
    });

    it('üstü hâlâ çöpteyken geri getirilen alt sayfa köke döner', async () => {
      const s = await space();
      const root = await doc(s.id, { title: 'Kök' });
      const child = await doc(s.id, { title: 'Alt', parentId: root.id });
      await owner.delete(api(`/docs/${child.id}`)).expect(204);
      await owner.delete(api(`/docs/${root.id}`)).expect(204);

      await owner.post(api(`/docs/${child.id}/restore`), {}).expect(204);
      const nodes = await tree(s.id);
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({ title: 'Alt', parentId: null });
    });

    it('süresi dolan sayfalar kalıcı silinir', async () => {
      const s = await space();
      const { id } = await doc(s.id, { title: 'Eski' });
      await owner.delete(api(`/docs/${id}`)).expect(204);
      await ctx.prisma.doc.update({
        where: { id },
        data: { deletedAt: new Date(Date.now() - 31 * 86_400_000) },
      });
      await ctx.app.get(LifecycleService).purgeExpired();
      expect(await ctx.prisma.doc.count({ where: { id } })).toBe(0);
      expect(await ctx.prisma.docVersion.count({ where: { docId: id } })).toBe(0);
    });
  });

  describe('yetki (brief §7)', () => {
    it('Stakeholder okur ama yazamaz; Developer yazar', async () => {
      const s = await space();
      const { id } = await doc(s.id, { title: 'Açık' });
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;

      await elif.get(api(`/spaces/${s.id}/docs`)).expect(200);
      await elif.get(api(`/docs/${id}`)).expect(200);
      await doc(s.id, { title: 'Yasak' }, elif).catch(() => undefined);
      await elif.post(api(`/spaces/${s.id}/docs`), { title: 'Yasak' }).expect(403);
      await save(id, { revision: 1, title: 'X' }, elif).expect(403);
      await elif.delete(api(`/docs/${id}`)).expect(403);

      await owner.put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);
      await elif.post(api(`/spaces/${s.id}/docs`), { title: 'İzinli' }).expect(201);
    });

    it('özel Space’in sayfaları üye olmayana görünmez', async () => {
      const s = await space({ isPrivate: true });
      const { id } = await doc(s.id, { title: 'Gizli' });
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      await elif.get(api(`/spaces/${s.id}/docs`)).expect(404);
      await elif.get(api(`/docs/${id}`)).expect(404);
      await elif.get(api(`/docs/${id}/versions`)).expect(404);
    });

    it('sayfaya dosya eklenir, indirilir, silinir; yetki ve görünürlük korunur', async () => {
      const s = await space();
      const { id } = await doc(s.id, { title: 'Ekli sayfa' });
      const pdf = Buffer.from('%PDF-1.4\n%test\n');
      await owner.upload(api(`/docs/${id}/attachments`), pdf, 'sartname.pdf').expect(201);
      await owner
        .upload(api(`/docs/${id}/attachments`), Buffer.from('MZ'), 'kurulum.exe')
        .expect(422);

      const page = await detail(id);
      expect(page.attachments.map((a) => [a.fileName, a.previewable])).toEqual([
        ['sartname.pdf', true],
      ]);
      const attId = page.attachments[0]!.id;
      const dl = await owner.download(api(`/docs/${id}/attachments/${attId}`)).expect(200);
      expect(Buffer.from(dl.body as Buffer).equals(pdf)).toBe(true);

      // Aynı kimlik görev yolundan açılmaz; bir sayfanın eki başka sayfadan okunmaz.
      const other = await doc(s.id, { title: 'Diğer' });
      await owner.download(api(`/docs/${other.id}/attachments/${attId}`)).expect(404);

      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      await elif.download(api(`/docs/${id}/attachments/${attId}`)).expect(200);
      await elif.upload(api(`/docs/${id}/attachments`), pdf, 'b.pdf').expect(403);
      await elif.delete(api(`/docs/${id}/attachments/${attId}`)).expect(403);

      await owner.delete(api(`/docs/${id}/attachments/${attId}`)).expect(204);
      expect((await detail(id)).attachments).toEqual([]);
      await owner.delete(api(`/docs/${id}/attachments/${attId}`)).expect(404);

      // Silinen sayfaya ek yüklenemez.
      await owner.delete(api(`/docs/${id}`)).expect(204);
      await owner.upload(api(`/docs/${id}/attachments`), pdf, 'c.pdf').expect(404);
    });

    it('arşivli Space’te yazma reddedilir', async () => {
      const s = await space();
      const { id } = await doc(s.id, { title: 'Not' });
      await owner.post(api(`/spaces/${s.id}/archive`), {}).expect(204);
      await owner.post(api(`/spaces/${s.id}/docs`), { title: 'Y' }).expect(409);
      await save(id, { revision: 1, title: 'X' }).expect(409);
      await owner.get(api(`/spaces/${s.id}/docs`)).expect(200);
    });
  });
});
