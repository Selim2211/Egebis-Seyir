import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MeResponse } from '@scrum/shared';
import request from 'supertest';
import { expect } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MailService } from '../src/infra/mail/mail.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';

export const SETUP_TOKEN = 'test-setup-token';
export const OWNER = { email: 'zeynep@example.com', password: 'owner-pass', name: 'Zeynep Kaya' };

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  mail: MailService;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService), mail: app.get(MailService) };
}

/** Her testten önce temiz veritabanı ve boş posta kutusu. */
export async function resetState(ctx: TestContext): Promise<void> {
  await ctx.prisma.$executeRawUnsafe('TRUNCATE TABLE users, workspaces RESTART IDENTITY CASCADE');
  ctx.mail.outbox.length = 0;
}

/** Cookie'leri saklayan ve CSRF başlığını otomatik ekleyen tarayıcı benzeri istemci. */
export class Client {
  private readonly agent: ReturnType<typeof request.agent>;
  private csrf = '';

  private constructor(app: INestApplication) {
    this.agent = request.agent(app.getHttpServer() as Parameters<typeof request.agent>[0]);
  }

  static async create(app: INestApplication): Promise<Client> {
    const client = new Client(app);
    const res = await client.agent.get('/api/setup/status');
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const csrf = cookies.find((c) => c.startsWith('sm_csrf='));
    client.csrf = csrf ? decodeURIComponent(csrf.split(';')[0]!.slice('sm_csrf='.length)) : '';
    return client;
  }

  get(path: string) {
    return this.agent.get(path);
  }
  post(path: string, body?: object) {
    return this.agent.post(path).set('x-csrf-token', this.csrf).send(body);
  }
  patch(path: string, body?: object) {
    return this.agent.patch(path).set('x-csrf-token', this.csrf).send(body);
  }
  put(path: string, body?: object) {
    return this.agent.put(path).set('x-csrf-token', this.csrf).send(body);
  }
  /** Çok parçalı dosya yükleme (alan adı `file`). */
  upload(path: string, buffer: Buffer, fileName: string) {
    return this.agent.post(path).set('x-csrf-token', this.csrf).attach('file', buffer, fileName);
  }
  /** İkili yanıtı Buffer olarak okur. */
  download(path: string) {
    return this.agent
      .get(path)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
  }
  delete(path: string) {
    return this.agent.delete(path).set('x-csrf-token', this.csrf);
  }
  /** CSRF başlığı olmadan (saldırı senaryosu). */
  postWithoutCsrf(path: string, body?: object) {
    return this.agent.post(path).send(body);
  }
}

/** İlk kurulumu yapar; Owner oturumu açık istemci ve workspace id döner. */
export async function setupOwner(
  ctx: TestContext,
): Promise<{ owner: Client; workspaceId: string }> {
  const owner = await Client.create(ctx.app);
  const res = await owner
    .post('/api/setup', {
      setupToken: SETUP_TOKEN,
      workspaceName: 'Test Kurumu',
      name: OWNER.name,
      email: OWNER.email,
      password: OWNER.password,
      locale: 'tr',
    })
    .expect(201);
  const me = res.body as MeResponse;
  return { owner, workspaceId: me.workspaces[0]!.id };
}

/** Son gönderilen e-postadan bağlantı token'ını çıkarır. */
export function tokenFromMail(ctx: TestContext, pattern: RegExp): string {
  const last = ctx.mail.outbox.at(-1);
  expect(last, 'e-posta gönderilmedi').toBeDefined();
  const match = pattern.exec(last!.text);
  expect(match, 'e-postada bağlantı yok').not.toBeNull();
  return decodeURIComponent(match![1]!);
}

export const INVITE_LINK = /\/invite\/([A-Za-z0-9_%-]+)/;
export const RESET_LINK = /token=([A-Za-z0-9_%-]+)/;

/** Davet edip kabul ettirir; yeni üyenin oturumu açık istemcisini döner. */
export async function inviteAndAccept(
  ctx: TestContext,
  owner: Client,
  workspaceId: string,
  person: { email: string; name: string; password: string },
  role: 'ADMIN' | 'MEMBER' | 'GUEST' = 'MEMBER',
  spaceIds?: string[],
): Promise<Client> {
  await owner
    .post(`/api/workspaces/${workspaceId}/invitations`, { emails: [person.email], role, spaceIds })
    .expect(204);
  const token = tokenFromMail(ctx, INVITE_LINK);
  const client = await Client.create(ctx.app);
  await client
    .post(`/api/invitations/${token}/accept`, {
      name: person.name,
      password: person.password,
      locale: 'tr',
    })
    .expect(200);
  return client;
}
