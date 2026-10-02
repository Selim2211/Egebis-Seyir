import { execSync } from 'node:child_process';

/** Entegrasyon testlerinden önce test veritabanını güncel migration'lara getirir. */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL tanımlı değil (apps/api/.env)');
  execSync('prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
