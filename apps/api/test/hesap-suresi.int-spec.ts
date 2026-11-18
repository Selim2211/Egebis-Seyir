import type { CreatedMember, Created, MembersResponse } from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const GUEST = { email: 'gast@example.com', name: 'Gast', password: 'gast-pass-123' };
const PM = { email: 'pm@example.com', name: 'Proje Yön', password: 'pm-pass-12345' };

const DAY = 86_400_000;

/** Süreli hesaplar ve Guest (ADR-169): Dış kaynak 90 gün (+90 Super Admin), Guest 30 gün, süre bitince kilit. */
describe('Hesap süresi: Dış kaynak ve Guest', () => {
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

  const space = async () =>
    (
      (await owner.post(api('/spaces'), { name: 'MOB', key: 'MOB', color: '#7C3AED' }).expect(201))
        .body as Created
    ).id;

  async function account(role: 'GUEST' | 'VIEWER', email: string, spaceId: string) {
    return (
      await owner
        .post(api('/members'), {
          name: email,
          email,
          role,
          password: 'pass-12345',
          spaceIds: [spaceId],
        })
        .expect(201)
    ).body as CreatedMember;
  }
  const membership = (userId: string) =>
    ctx.prisma.membership.findFirstOrThrow({ where: { userId } });

  it('Dış kaynak 90 gün, Guest 30 gün ile açılır; Member süresizdir', async () => {
    const s = await space();
    const dis = await account('GUEST', 'dis@example.com', s);
    const gst = await account('VIEWER', 'guest@example.com', s);
    const mem = (
      await owner
        .post(api('/members'), {
          name: 'Mem',
          email: 'mem@example.com',
          role: 'MEMBER',
          password: 'pass-12345',
        })
        .expect(201)
    ).body as CreatedMember;
    const days = async (id: string) => {
      const e = (await membership(id)).expiresAt;
      return e ? Math.round((e.getTime() - Date.now()) / DAY) : null;
    };
    expect(await days(dis.userId)).toBe(90);
    expect(await days(gst.userId)).toBe(30);
    expect(await days(mem.userId)).toBeNull();
  });

  it('Super Admin Dış kaynağı +90 gün uzatır; Guest uzatılamaz', async () => {
    const s = await space();
    const dis = await account('GUEST', 'dis@example.com', s);
    const gst = await account('VIEWER', 'guest@example.com', s);
    const before = (await membership(dis.userId)).expiresAt!;
    await owner.post(api(`/members/${dis.userId}/extend-expiry`), {}).expect(200);
    const after = (await membership(dis.userId)).expiresAt!;
    expect(Math.round((after.getTime() - before.getTime()) / DAY)).toBe(90);

    const res = await owner.post(api(`/members/${gst.userId}/extend-expiry`), {}).expect(422);
    expect((res.body as { code: string }).code).toBe('EXPIRY_NOT_EXTENDABLE');
  });

  it('süresi biten hesap kilitlenir; uzatınca açılır', async () => {
    const s = await space();
    const dis = await account('GUEST', 'dis@example.com', s);
    await ctx.prisma.membership.updateMany({
      where: { userId: dis.userId },
      data: { expiresAt: new Date(Date.now() - DAY) },
    });
    const list = (await owner.get(api('/members')).expect(200)).body as MembersResponse;
    const row = list.members.find((m) => m.userId === dis.userId)!;
    expect(row.locked).toBe(true);
    expect(row.tier).toBe('GUEST');

    await owner.post(api(`/members/${dis.userId}/extend-expiry`), {}).expect(200);
    const again = (await owner.get(api('/members')).expect(200)).body as MembersResponse;
    expect(again.members.find((m) => m.userId === dis.userId)!.locked).toBe(false);
  });

  it('rol değişince süre yeniden başlar; Member olunca süresiz', async () => {
    const s = await space();
    const dis = await account('GUEST', 'dis@example.com', s);
    await owner.patch(api(`/members/${dis.userId}`), { role: 'VIEWER' }).expect(204);
    expect(
      Math.round(((await membership(dis.userId)).expiresAt!.getTime() - Date.now()) / DAY),
    ).toBe(30);
    await owner.patch(api(`/members/${dis.userId}`), { role: 'MEMBER' }).expect(204);
    expect((await membership(dis.userId)).expiresAt).toBeNull();
  });

  it('Guest yazamaz ve yönetemez; Projeye yalnızca Super Admin ekler', async () => {
    const s = await space();
    const guest = await inviteAndAccept(ctx, owner, ws, GUEST, 'VIEWER', [s]);
    const detail = (await guest.get(api(`/spaces/${s}`)).expect(200)).body as {
      permissions: string[];
    };
    expect(detail.permissions).toContain('space.view');
    expect(detail.permissions).not.toContain('workItem.write');
    expect(detail.permissions).not.toContain('space.settings');

    // Proje Yöneticisi Guest'i başka Projeye ekleyemez.
    const pm = await inviteAndAccept(ctx, owner, ws, PM, 'MEMBER', [s]);
    const other = (
      await owner.post(api('/spaces'), { name: 'PRT', key: 'PRT', color: '#2563EB' }).expect(201)
    ).body as Created;
    const pmId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: PM.email } })).id;
    const guestId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: GUEST.email } })).id;
    const projectManager = await ctx.prisma.role.findFirstOrThrow({
      where: { scope: 'SPACE', key: 'PROJECT_MANAGER' },
    });
    await ctx.prisma.spaceMember.create({
      data: { workspaceId: ws, spaceId: other.id, userId: pmId, roleId: projectManager.id },
    });
    const res = await pm
      .put(api(`/spaces/${other.id}/members/${guestId}`), { role: 'PROJECT_MEMBER' })
      .expect(403);
    expect((res.body as { code: string }).code).toBe('VIEWER_ADMIN_ONLY');
    await owner
      .put(api(`/spaces/${other.id}/members/${guestId}`), { role: 'PROJECT_MEMBER' })
      .expect(204);
  });
});
