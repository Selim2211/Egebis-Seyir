import type { Created } from '@scrum/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, resetState, setupOwner, type TestContext } from './helpers';

describe('Yapay zekâ kapalıyken (anahtar yok)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetState(ctx);
    ({ owner, workspaceId: ws } = await setupOwner(ctx));
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('durum kapalı; özellikler 503 AI_DISABLED', async () => {
    const api = (path: string) => `/api/workspaces/${ws}${path}`;
    expect((await owner.get(api('/ai/status')).expect(200)).body).toEqual({ enabled: false });
    const space = (
      await owner.post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' }).expect(201)
    ).body as Created;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as {
      spaces: Array<{ id: string; lists: Array<{ id: string }> }>;
    };
    const listId = tree.spaces.find((s) => s.id === space.id)!.lists[0]!.id;
    const item = (
      await owner.post(api(`/lists/${listId}/items`), { type: 'TASK', title: 'İş' }).expect(201)
    ).body as Created;
    const res = await owner.post(api(`/items/${item.id}/ai/summarize`), {}).expect(503);
    expect(res.body).toEqual({ code: 'AI_DISABLED' });
  });
});
