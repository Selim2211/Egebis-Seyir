import type { GitLinkKind, GitLinkState, GitProvider } from '../schemas/git';

/** Metindeki iş anahtarları: `PRJ-142` (büyük harfli önek 2–10 karakter, tire, sayı). */
export function extractItemKeys(text: string): Array<{ prefix: string; number: number }> {
  const seen = new Set<string>();
  const result: Array<{ prefix: string; number: number }> = [];
  for (const match of text.matchAll(
    /(?<![A-Za-z0-9_])([A-Z][A-Z0-9]{1,9})-(\d{1,9})(?![A-Za-z0-9_])/g,
  )) {
    const key = `${match[1]}-${match[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ prefix: match[1]!, number: Number(match[2]) });
  }
  return result;
}

/** Sağlayıcıdan gelen, normalize edilmiş bağlantı olayı. */
export interface GitEvent {
  provider: GitProvider;
  kind: GitLinkKind;
  repo: string;
  /** Benzersiz kimlik: commit sha'sı veya PR numarası. */
  externalId: string;
  title: string;
  url: string | null;
  state: GitLinkState | null;
  author: string | null;
  /** Anahtarların aranacağı metin (başlık, mesaj, dal adı, PR gövdesi). */
  text: string;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === 'object' && v !== null ? (v as Json) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const idOf = (v: unknown): string | null =>
  typeof v === 'number' || (typeof v === 'string' && v !== '') ? String(v) : null;
const firstLine = (text: string) => text.split(/\r?\n/, 1)[0]!.slice(0, 200);

/** GitHub `push` ve `pull_request` olaylarını normalleştirir; diğer olaylar boş liste. */
export function parseGithubEvent(event: string, body: unknown): GitEvent[] {
  const b = obj(body);
  const repo = str(obj(b.repository).full_name) ?? '';
  if (event === 'push') {
    return arr(b.commits).flatMap((raw) => {
      const c = obj(raw);
      const sha = str(c.id);
      const message = str(c.message);
      if (!sha || !message) return [];
      return [
        {
          provider: 'GITHUB' as const,
          kind: 'COMMIT' as const,
          repo,
          externalId: sha,
          title: firstLine(message),
          url: str(c.url),
          state: null,
          author: str(obj(c.author).name) ?? str(obj(c.author).username),
          text: message,
        },
      ];
    });
  }
  if (event === 'pull_request') {
    const pr = obj(b.pull_request);
    const number = idOf(pr.number ?? b.number);
    const title = str(pr.title);
    if (number === null || !title) return [];
    const merged = pr.merged === true;
    const state: GitLinkState = merged ? 'MERGED' : pr.state === 'closed' ? 'CLOSED' : 'OPEN';
    return [
      {
        provider: 'GITHUB',
        kind: 'PULL_REQUEST',
        repo,
        externalId: number,
        title,
        url: str(pr.html_url),
        state,
        author: str(obj(pr.user).login),
        text: [title, str(pr.body), str(obj(pr.head).ref)].filter(Boolean).join('\n'),
      },
    ];
  }
  return [];
}

/** GitLab `Push Hook` ve `Merge Request Hook` olaylarını normalleştirir. */
export function parseGitlabEvent(event: string, body: unknown): GitEvent[] {
  const b = obj(body);
  const repo = str(obj(b.project).path_with_namespace) ?? '';
  if (event === 'Push Hook') {
    return arr(b.commits).flatMap((raw) => {
      const c = obj(raw);
      const sha = str(c.id);
      const message = str(c.message);
      if (!sha || !message) return [];
      return [
        {
          provider: 'GITLAB' as const,
          kind: 'COMMIT' as const,
          repo,
          externalId: sha,
          title: firstLine(message),
          url: str(c.url),
          state: null,
          author: str(obj(c.author).name),
          text: message,
        },
      ];
    });
  }
  if (event === 'Merge Request Hook') {
    const attrs = obj(b.object_attributes);
    const iid = idOf(attrs.iid);
    const title = str(attrs.title);
    if (iid === null || !title) return [];
    const stateText = str(attrs.state);
    const state: GitLinkState =
      stateText === 'merged' ? 'MERGED' : stateText === 'closed' ? 'CLOSED' : 'OPEN';
    return [
      {
        provider: 'GITLAB',
        kind: 'PULL_REQUEST',
        repo,
        externalId: iid,
        title,
        url: str(attrs.url),
        state,
        author: str(obj(b.user).username) ?? str(obj(b.user).name),
        text: [title, str(attrs.description), str(attrs.source_branch)].filter(Boolean).join('\n'),
      },
    ];
  }
  return [];
}
