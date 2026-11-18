/**
 * Yük testi ortak yardımcıları: çerez/CSRF taşıyan istemci, istatistik, süre ölçümü.
 * Yalnızca kilitli 3200 API'sine bağlanır (guard.cjs).
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const guard = require('./guard.cjs');

export const BASE = guard.assertLoadApi(process.env.LOAD_API || guard.LOAD_API);
export const OWNER = { email: 'owner@load.test', password: 'load-pass-123', name: 'Yük Sahibi' };
export const PASSWORD = 'load-pass-123';

export class Http {
  constructor() {
    this.cookies = new Map();
    this.csrf = '';
  }
  #store(res) {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      if (/Max-Age=0|expires=Thu, 01 Jan 1970/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
      if (name === 'sm_csrf') this.csrf = decodeURIComponent(value);
    }
  }
  async request(method, path, body, { timeoutMs = 60_000 } = {}) {
    const headers = { accept: 'application/json' };
    if (this.cookies.size)
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (method !== 'GET') headers['x-csrf-token'] = this.csrf;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const t0 = performance.now();
    let res;
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: payload,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      return {
        ok: false,
        status: 0,
        ms: performance.now() - t0,
        bytes: 0,
        error: e.name === 'TimeoutError' ? 'timeout' : 'network',
        json: null,
        serverMs: null,
      };
    }
    this.#store(res);
    const text = await res.text();
    const ms = performance.now() - t0;
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    const st = /app;dur=([\d.]+)/.exec(res.headers.get('server-timing') ?? '');
    return {
      ok: res.ok,
      status: res.status,
      ms,
      bytes: Buffer.byteLength(text),
      json,
      serverMs: st ? Number(st[1]) : null,
    };
  }
  get = (p, o) => this.request('GET', p, undefined, o);
  post = (p, b, o) => this.request('POST', p, b, o);
  patch = (p, b, o) => this.request('PATCH', p, b, o);
  put = (p, b, o) => this.request('PUT', p, b, o);
  /** CSRF çerezini almak için ilk istek. */
  async prime() {
    await this.get('/api/setup/status');
  }
  async login(email, password = PASSWORD) {
    await this.prime();
    const r = await this.post('/api/auth/login', { email, password });
    if (!r.ok) throw new Error(`giriş başarısız ${email}: ${r.status} ${JSON.stringify(r.json)}`);
    return r.json;
  }
}

export function stats(values) {
  if (!values.length) return { n: 0 };
  const s = [...values].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return {
    n: s.length,
    min: +s[0].toFixed(1),
    p50: +q(0.5).toFixed(1),
    p95: +q(0.95).toFixed(1),
    p99: +q(0.99).toFixed(1),
    max: +s.at(-1).toFixed(1),
    mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1),
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
