import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

/** OWASP önerisi: argon2id, 19 MiB bellek, 2 tur, 1 iş parçacığı (ADR-038). */
const PARAMS = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 } as const;

function derive(
  password: string,
  salt: Buffer,
  p: { memory: number; passes: number; parallelism: number; tagLength: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2('argon2id', { message: password, nonce: salt, ...p }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

const b64 = (buf: Buffer) => buf.toString('base64').replace(/=+$/, '');

/** PHC biçiminde özet: $argon2id$v=19$m=…,t=…,p=…$<tuz>$<özet> */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, PARAMS);
  return `$argon2id$v=19$m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, phc: string): Promise<boolean> {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/.exec(phc);
  if (!match) return false;
  const [, m, t, p, saltB64, hashB64] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await derive(password, Buffer.from(saltB64, 'base64'), {
    memory: Number(m),
    passes: Number(t),
    parallelism: Number(p),
    tagLength: expected.length,
  });
  return timingSafeEqual(actual, expected);
}

/**
 * Kullanıcı bulunamadığında da aynı sürede yanıt vermek için kullanılan sabit özet
 * (e-postanın kayıtlı olup olmadığı zamanlamadan anlaşılmasın).
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c2NydW0tbWFuYWdlci1kdW1teQ$ZHVtbXktaGFzaC1mb3ItdGltaW5nLXNhZmV0eS0xMjM0';
