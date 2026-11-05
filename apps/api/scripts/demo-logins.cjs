/* eslint-disable */
/**
 * Demo kişilerinin YEREL ortamda giriş yapabilmesi için (demo-seed.cjs'ten sonra çalıştırılır):
 * - demo kişilere (…@demo.seyir.invalid) tek, rastgele üretilmiş bir test şifresi verir,
 * - MOB Projesine bir dış kaynak demo kullanıcısı ekler (doküman/video erişimi kapalı),
 * - hesap listesini ve şifreyi depo kökündeki `demo-hesaplar.local.txt` dosyasına yazar (git'e girmez).
 * Üretim sunucusunda ÇALIŞTIRMAYIN: bu hesaplar bilinen şifreyle girilebilir olur.
 *
 * Çalıştırma (apps/api içinde, derlenmiş dist ile):  node -r dotenv/config scripts/demo-logins.cjs
 */
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const APP = path.resolve(__dirname, '..');
const { PrismaClient } = require(path.join(APP, 'dist/generated/prisma/client.js'));
const { PrismaPg } = require(require.resolve('@prisma/adapter-pg', { paths: [APP] }));
const { hashPassword } = require(path.join(APP, 'dist/infra/security/password.js'));

const DOMAIN = 'demo.seyir.invalid';
const OUT = path.resolve(APP, '../../demo-hesaplar.local.txt');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error('Yalnızca yerel veritabanında çalışır.');
  }
  const password = `Demo-${crypto.randomBytes(6).toString('base64url')}`;
  const hash = await hashPassword(password);
  const ws = await db.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const roles = await db.role.findMany({ where: { workspaceId: ws.id } });
  const role = (scope, key) => roles.find((r) => r.scope === scope && r.key === key).id;

  // Dış kaynak demo kullanıcısı (yoksa).
  const outsourceEmail = `oya.kaya@${DOMAIN}`;
  let oya = await db.user.findUnique({ where: { email: outsourceEmail } });
  if (!oya) {
    oya = await db.user.create({
      data: {
        email: outsourceEmail,
        name: 'Oya Kaya',
        title: 'Dış kaynak geliştirici',
        locale: 'tr',
        passwordHash: hash,
      },
    });
    await db.membership.create({
      data: {
        workspaceId: ws.id,
        userId: oya.id,
        roleId: role('WORKSPACE', 'GUEST'),
        contentAccess: 'NONE',
      },
    });
    const mob = await db.space.findFirst({
      where: { workspaceId: ws.id, key: 'MOB', deletedAt: null },
    });
    if (mob) {
      await db.spaceMember.create({
        data: {
          workspaceId: ws.id,
          spaceId: mob.id,
          userId: oya.id,
          roleId: role('SPACE', 'PROJECT_MEMBER'),
        },
      });
    }
  }

  await db.user.updateMany({
    where: { email: { endsWith: '@' + DOMAIN } },
    data: { passwordHash: hash },
  });

  const users = await db.user.findMany({
    where: { email: { endsWith: '@' + DOMAIN } },
    orderBy: { name: 'asc' },
    select: {
      name: true,
      email: true,
      memberships: { where: { workspaceId: ws.id }, select: { role: { select: { key: true } } } },
      spaceMembers: {
        where: { space: { deletedAt: null } },
        select: { role: { select: { key: true } }, space: { select: { key: true } } },
      },
    },
  });
  const tier = {
    OWNER: 'Super Admin (Sahip)',
    ADMIN: 'Super Admin',
    MEMBER: 'Üye',
    GUEST: 'Dış kaynak',
  };
  const lines = [
    'Egebis Seyir — YEREL demo hesapları (git’e girmez, paylaşmayın)',
    `Ortak test şifresi: ${password}`,
    'Giriş: http://localhost:5173  (e-posta adresleri .invalid; bu kişilere posta gitmez)',
    '',
    ...users.map((u) => {
      const t = tier[u.memberships[0]?.role.key] ?? '-';
      const projects = u.spaceMembers
        .map((m) => `${m.space.key}:${m.role.key === 'PROJECT_MANAGER' ? 'Yönetici' : 'Üye'}`)
        .join(', ');
      return `${u.name.padEnd(14)} ${u.email.padEnd(36)} ${t.padEnd(12)} ${projects}`;
    }),
    '',
    'Yeni şifre için betiği yeniden çalıştırın; demo verisini silmek: node -r dotenv/config scripts/demo-seed.cjs --remove',
  ];
  fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
  console.log(`${users.length} demo hesabı hazır; liste ve şifre: ${OUT}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
