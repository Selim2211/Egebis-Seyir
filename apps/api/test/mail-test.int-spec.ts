import type { MailTestResult } from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type Client,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass' };

describe('Test e-postası (Ayarlar → Genel, ADR-119)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const url = () => `/api/workspaces/${ws}/settings/mail-test`;

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

  it('yöneticinin kendi adresine gider ve sonucu döner', async () => {
    const before = ctx.mail.outbox.length;
    const res = (await owner.post(url(), {}).expect(200)).body as MailTestResult;
    expect(res).toMatchObject({ ok: true, code: null, detail: null });
    const sent = ctx.mail.outbox.slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(res.to);
    expect(sent[0]!.subject).toMatch(/test/i);
  });

  it('workspace.settings izni olmayan Member yapamaz', async () => {
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const before = ctx.mail.outbox.length;
    await elif.post(url(), {}).expect(403);
    expect(ctx.mail.outbox).toHaveLength(before);
  });
});
