import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { E2E } from '../playwright.config';

const apiDir = fileURLToPath(new URL('../../api', import.meta.url));

/** Her koşu temiz başlar: e2e veritabanı güncel şemaya getirilir, veriler ve posta kutusu boşaltılır. */
export default async function globalSetup(): Promise<void> {
  const env = { ...process.env, DATABASE_URL: E2E.databaseUrl };
  execSync('pnpm exec prisma migrate deploy', { cwd: apiDir, env, stdio: 'inherit' });
  execSync('pnpm exec prisma db execute --stdin', {
    cwd: apiDir,
    env,
    input: 'TRUNCATE TABLE users, workspaces RESTART IDENTITY CASCADE;',
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  // Mailpit yoksa yalnızca e-posta bekleyen senaryolar başarısız olur; diğerleri çalışır.
  await fetch(`${E2E.mailpitUrl}/api/v1/messages`, { method: 'DELETE' }).catch(() => undefined);
}
