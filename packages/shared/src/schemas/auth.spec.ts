import { describe, expect, it } from 'vitest';
import { EmailSchema } from './auth';

const ok = (v: string) => EmailSchema.safeParse(v).success;

describe('EmailSchema (RFC 5321 sınırları)', () => {
  it.each([
    'a@b.co',
    'selim.akinci@egebis.com.tr',
    'user+tag@example.com',
    "o'brien@example.com",
    'a_b-c@sub.example.org',
    'x@xn--bcher-kva.example',
    '  Mixed.Case@Example.COM  ',
  ])('kabul eder: %s', (v) => expect(ok(v)).toBe(true));

  it.each([
    'a@b',
    '@b.co',
    'a@@b.co',
    'a b@c.co',
    'a..b@c.co',
    '.a@c.co',
    'a.@c.co',
    'a@-b.co',
    'a@b-.co',
    'a@b..co',
    'a@b.c',
    'a@[1.2.3.4]',
    `${'a'.repeat(65)}@b.co`,
    `a@${'b'.repeat(64)}.co`,
    `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.com`,
    '',
  ])('reddeder: %s', (v) => expect(ok(v)).toBe(false));

  it('kırpar ve küçük harfe çevirir', () => {
    expect(EmailSchema.parse('  Mixed.Case@Example.COM ')).toBe('mixed.case@example.com');
  });
});
