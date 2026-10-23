import type {
  BugsResponse,
  Created,
  CreatedItem,
  HierarchyResponse,
  WorkItemDetail,
} from '@scrum/shared';
import { simpleParser } from 'mailparser';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TicketsService } from '../src/modules/tickets/tickets.service';
import { Client, createTestApp, resetState, setupOwner, type TestContext } from './helpers';

/** ADR-138: e-postadan otomatik Bug (çağrı sistemi), yanıtlar, Bug → Task çevirme. */
describe('Çağrı sistemi (gerçek veritabanı)', { timeout: 30_000 }, () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  // 1x1 PNG
  const PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const mime = (o: {
    from: string;
    subject: string;
    id: string;
    text: string;
    headers?: string[];
    inReplyTo?: string;
    attach?: boolean;
    to?: string;
  }) =>
    Buffer.from(
      [
        `From: ${o.from}`,
        `To: ${o.to ?? 'destek@egebis.com.tr'}`,
        `Subject: ${o.subject}`,
        `Message-ID: <${o.id}>`,
        ...(o.inReplyTo ? [`In-Reply-To: ${o.inReplyTo}`, `References: ${o.inReplyTo}`] : []),
        'Date: Fri, 23 Oct 2026 10:00:00 +0300',
        ...(o.headers ?? []),
        'MIME-Version: 1.0',
        'Content-Type: multipart/mixed; boundary="b1"',
        '',
        '--b1',
        'Content-Type: text/plain; charset=utf-8',
        '',
        o.text,
        ...(o.attach === false
          ? []
          : [
              '--b1',
              'Content-Type: image/png; name="hata.png"',
              'Content-Disposition: attachment; filename="hata.png"',
              'Content-Transfer-Encoding: base64',
              '',
              PNG,
            ]),
        '--b1--',
        '',
      ].join('\r\n'),
    );

  const ingest = async (raw: Buffer) => {
    const tickets = ctx.app.get(TicketsService);
    return tickets.ingest(await simpleParser(raw), raw, new Date('2026-10-23T07:00:00Z'));
  };
  const inboxSpace = async () => {
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    return tree.spaces.find((s) => s.name === 'Gelen Çağrılar')!;
  };
  const bugs = async (spaceId: string) =>
    ((await owner.get(api(`/spaces/${spaceId}/bugs`)).expect(200)).body as BugsResponse).bugs;
  const detail = async (id: string) =>
    (await owner.get(api(`/items/${id}`)).expect(200)).body as WorkItemDetail;

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

  it('e-posta Bug olur: konu başlık, metin açıklama, dosya ek, gönderen ve zaman kayıtlı', async () => {
    const result = await ingest(
      mime({
        from: 'Ayşe Müşteri <ayse@firma.com>',
        subject: 'Fwd: Re: Sepet açılmıyor',
        id: 'm1@firma.com',
        text: 'Merhaba,\nsepet sayfası beyaz geliyor.\n\nEkran görüntüsü ektedir.',
      }),
    );
    expect(result).toBe('created');

    const inbox = await inboxSpace();
    expect(inbox.lists.map((l) => l.name)).toEqual(['Belirsiz']);
    const rows = await bugs(inbox.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: 'Sepet açılmıyor',
      fromEmail: { name: 'Ayşe Müşteri', email: 'ayse@firma.com' },
      convertedTo: [],
      reporter: null,
    });

    const bug = await detail(rows[0]!.id);
    expect(bug.type).toBe('BUG');
    expect(bug.attachments.map((a) => a.fileName)).toEqual(['hata.png']);
    expect(JSON.stringify(bug.description)).toContain('sepet sayfası beyaz geliyor');
    // Müşteriye otomatik yanıt hazırlanır (testte gerçekten gönderilmez).
    const outbox = ctx.app.get(TicketsService).outbox;
    expect(outbox.at(-1)).toMatchObject({
      to: 'ayse@firma.com',
      subject: 'Re: Sepet açılmıyor',
      inReplyTo: '<m1@firma.com>',
    });
    expect(outbox.at(-1)!.text).toContain(bug.key);
    expect(bug.inbound).toMatchObject({
      fromName: 'Ayşe Müşteri',
      fromEmail: 'ayse@firma.com',
      subject: 'Fwd: Re: Sepet açılmıyor',
      receivedAt: '2026-10-23T07:00:00.000Z',
      replyCount: 0,
    });
  });

  it('aynı e-posta iki kez Bug olmaz; otomatik e-postalar atlanır', async () => {
    const raw = mime({ from: 'a@firma.com', subject: 'Hata', id: 'dup@firma.com', text: 'x' });
    expect(await ingest(raw)).toBe('created');
    expect(await ingest(raw)).toBe('duplicate');
    expect(
      await ingest(
        mime({
          from: 'b@firma.com',
          subject: 'Out of office',
          id: 'auto@firma.com',
          text: 'tatildeyim',
          headers: ['Auto-Submitted: auto-replied'],
        }),
      ),
    ).toBe('ignored');
    expect(
      await ingest(
        mime({
          from: 'mailer-daemon@x.com',
          subject: 'Undelivered',
          id: 'bounce@x.com',
          text: '.',
        }),
      ),
    ).toBe('ignored');
    expect(await bugs((await inboxSpace()).id)).toHaveLength(1);
  });

  it('gönderen workspace üyesiyse Bug onun olur', async () => {
    const me = (await owner.get('/api/auth/me').expect(200)).body as { user: { email: string } };
    await ingest(
      mime({
        from: `Selim <${me.user.email}>`,
        subject: 'Kendi hatam',
        id: 'own@x.com',
        text: 'x',
        attach: false,
      }),
    );
    const rows = await bugs((await inboxSpace()).id);
    expect(rows[0]!.reporter).not.toBeNull();
  });

  it('müşterinin yanıtı mevcut Bug’a yorum olur (yeni Bug açılmaz)', async () => {
    await ingest(
      mime({
        from: 'ayse@firma.com',
        subject: 'Hata',
        id: 'first@firma.com',
        text: 'ilk',
        attach: false,
      }),
    );
    const bug = (await bugs((await inboxSpace()).id))[0]!;
    const result = await ingest(
      mime({
        from: 'Ayşe <ayse@firma.com>',
        subject: 'Re: Hata',
        id: 'second@firma.com',
        inReplyTo: '<first@firma.com>',
        text: 'Yeni bilgi: Chrome 130.\n\n23.10.2026 tarihinde Egebis yazdı:\n> Talebiniz alındı',
        attach: true,
      }),
    );
    expect(result).toBe('reply');
    expect(await bugs((await inboxSpace()).id)).toHaveLength(1);

    const comments = (await owner.get(api(`/items/${bug.id}/comments`)).expect(200)).body as {
      comments: Array<Record<string, unknown>>;
    };
    expect(comments.comments).toHaveLength(1);
    expect(JSON.stringify(comments.comments[0])).toContain('Müşteri yanıtı');
    expect(JSON.stringify(comments.comments[0])).toContain('Yeni bilgi: Chrome 130.');
    expect(JSON.stringify(comments.comments[0])).not.toContain('Talebiniz alındı');
    const after = await detail(bug.id);
    expect(after.inbound!.replyCount).toBe(1);
    expect(after.attachments.map((a) => a.fileName)).toEqual(['hata.png']);
  });

  it('Bug Task’a çevrilir; Bug kalır, Task kaynağını ve geçmişini gösterir', async () => {
    await ingest(
      mime({
        from: 'ayse@firma.com',
        subject: 'Büyük sorun',
        id: 'big@firma.com',
        text: 'ayrıntı',
        attach: false,
      }),
    );
    const inbox = await inboxSpace();
    const bug = (await bugs(inbox.id))[0]!;

    const task = (await owner.post(api(`/items/${bug.id}/convert-bug-to-task`)).expect(201))
      .body as CreatedItem;

    const bugAfter = await detail(bug.id);
    expect(bugAfter.type).toBe('BUG');
    expect(bugAfter.convertedTasks).toEqual([{ id: task.id, key: task.key, title: 'Büyük sorun' }]);
    expect((await bugs(inbox.id))[0]!.convertedTo).toEqual([task.key]);

    const taskDetail = await detail(task.id);
    expect(taskDetail.type).toBe('TASK');
    expect(taskDetail.sourceBug).toEqual({ id: bug.id, key: bug.key, title: 'Büyük sorun' });
    expect(taskDetail.inbound?.fromEmail).toBe('ayse@firma.com');
    expect(JSON.stringify(taskDetail.description)).toContain('ayrıntı');

    const feed = (await owner.get(api(`/items/${task.id}/activity`)).expect(200)).body as {
      events: Array<{ action: string; detail: string | null }>;
    };
    expect(feed.events.map((e) => e.action)).toContain('item.created_from_bug');
    const bugFeed = (await owner.get(api(`/items/${bug.id}/activity`)).expect(200)).body as {
      events: Array<{ action: string; detail: string | null }>;
    };
    expect(bugFeed.events.find((e) => e.action === 'item.converted_to_task')?.detail).toBe(
      task.key,
    );
  });

  it('gelen kutusu Bug’ı gerçek bir Projeye taşınabilir', async () => {
    await ingest(
      mime({
        from: 'ayse@firma.com',
        subject: 'Taşınacak',
        id: 'mv@firma.com',
        text: 'x',
        attach: false,
      }),
    );
    const bug = (await bugs((await inboxSpace()).id))[0]!;
    const target = (
      await owner.post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' }).expect(201)
    ).body as Created;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === target.id)!.lists[0]!.id;
    await owner.post(api(`/items/${bug.id}/move`), { listId }).expect(204);
    expect((await bugs(target.id)).map((b) => b.id)).toEqual([bug.id]);
    expect(await bugs((await inboxSpace()).id)).toHaveLength(0);
  });

  it('destek yanıtı (gönderilmiş öğeler) ve müşteri yanıtı Bug’ın ve çevrilen Task’ın yorumlarına düşer', async () => {
    await ingest(
      mime({
        from: 'ayse@firma.com',
        subject: 'Hata var',
        id: 't1@firma.com',
        text: 'ilk mesaj',
        attach: false,
      }),
    );
    const inbox = await inboxSpace();
    const bug = (await bugs(inbox.id))[0]!;
    const tickets = ctx.app.get(TicketsService);
    const sent = async (raw: Buffer) =>
      tickets.ingestSent(await simpleParser(raw), raw, new Date('2026-10-23T08:00:00Z'));
    const comments = async (id: string) =>
      (
        (await owner.get(api(`/items/${id}/comments`)).expect(200)).body as {
          comments: Array<Record<string, unknown>>;
        }
      ).comments.map((c) => JSON.stringify(c));

    // Konuşma Task'a çevrilmeden önce: destek yanıtı Bug'a yorum olur.
    const supportReply = (id: string, text: string) =>
      mime({
        from: 'Destek Ekibi <destek@egebis.com.tr>',
        to: 'ayse@firma.com',
        subject: 'Re: Hata var',
        id,
        inReplyTo: '<t1@firma.com>',
        text,
        attach: false,
      });
    expect(await sent(supportReply('s1@egebis.com.tr', 'Kontrol ediyoruz.\n\n> alıntı'))).toBe(
      'reply',
    );
    expect(await sent(supportReply('s1@egebis.com.tr', 'Kontrol ediyoruz.'))).toBe('duplicate');
    let bugComments = await comments(bug.id);
    expect(bugComments).toHaveLength(1);
    expect(bugComments[0]).toContain('Destek yanıtı — Destek Ekibi → ayse@firma.com');
    expect(bugComments[0]).toContain('Kontrol ediyoruz.');
    expect(bugComments[0]).not.toContain('alıntı');

    // İlgisiz giden e-posta ve otomatik yanıtlar yazışmaya girmez.
    expect(
      await sent(
        mime({
          from: 'destek@egebis.com.tr',
          to: 'x@y.com',
          subject: 'Başka konu',
          id: 'x1@e.com',
          text: 'x',
          attach: false,
        }),
      ),
    ).toBe('ignored');
    expect(
      await sent(
        mime({
          from: 'destek@egebis.com.tr',
          to: 'ayse@firma.com',
          subject: 'Re: Hata var',
          id: 'ack@e.com',
          inReplyTo: '<t1@firma.com>',
          text: 'Talebiniz alındı',
          headers: ['Auto-Submitted: auto-replied'],
          attach: false,
        }),
      ),
    ).toBe('ignored');

    // Task'a çevrilince o ana kadarki yazışma Task'a kopyalanır.
    const task = (await owner.post(api(`/items/${bug.id}/convert-bug-to-task`)).expect(201))
      .body as CreatedItem;
    let taskComments = await comments(task.id);
    expect(taskComments).toHaveLength(1);
    expect(taskComments[0]).toContain('Destek yanıtı');

    // Çevirmeden sonraki müşteri ve destek yanıtları hem Bug'a hem Task'a yazılır.
    expect(
      await ingest(
        mime({
          from: 'ayse@firma.com',
          subject: 'Re: Hata var',
          id: 'c2@firma.com',
          inReplyTo: '<s1@egebis.com.tr>',
          text: 'Safari 17 de',
          attach: false,
        }),
      ),
    ).toBe('reply');
    expect(await sent(supportReply('s2@egebis.com.tr', 'Düzeltme yolda.'))).toBe('reply');
    bugComments = await comments(bug.id);
    taskComments = await comments(task.id);
    for (const list of [bugComments, taskComments]) {
      expect(list).toHaveLength(3);
      expect(list.join('')).toContain('Müşteri yanıtı — ayse <ayse@firma.com>');
      expect(list.join('')).toContain('Safari 17 de');
      expect(list.join('')).toContain('Düzeltme yolda.');
    }
    expect((await detail(bug.id)).inbound!.replyCount).toBe(3);
  });
});
