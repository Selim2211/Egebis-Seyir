import { describe, expect, it } from 'vitest';
import { checkWebhookUrl, isPrivateHost } from './webhook-url';

describe('webhook adresi', () => {
  it('özel ağ adreslerini tanır', () => {
    for (const h of [
      'localhost',
      'a.localhost',
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.9.9',
      '192.168.1.5',
      '169.254.169.254',
      '::1',
      'fd12::1',
      '::ffff:10.0.0.1',
      'x.internal',
    ]) {
      expect(isPrivateHost(h)).toBe(true);
    }
    for (const h of ['example.com', '8.8.8.8', '172.32.0.1', '11.0.0.1'])
      expect(isPrivateHost(h)).toBe(false);
  });
  it('yalnızca http(s), kimlik bilgisi yok, meta veri her zaman yasak', () => {
    expect(checkWebhookUrl('https://hooks.slack.com/x', false)).toBe(true);
    expect(checkWebhookUrl('ftp://a.com', true)).toBe(false);
    expect(checkWebhookUrl('https://u:p@a.com', true)).toBe(false);
    expect(checkWebhookUrl('http://169.254.169.254/latest', true)).toBe(false);
    expect(checkWebhookUrl('not a url', true)).toBe(false);
  });
  it('dahili adres yalnızca izin verilirse kabul edilir', () => {
    expect(checkWebhookUrl('http://localhost:9000/hook', false)).toBe(false);
    expect(checkWebhookUrl('http://localhost:9000/hook', true)).toBe(true);
    expect(checkWebhookUrl('http://192.168.0.5/hook', false)).toBe(false);
  });
});
