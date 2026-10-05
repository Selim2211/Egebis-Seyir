import { describe, expect, it } from 'vitest';
import { extractItemKeys, parseGithubEvent, parseGitlabEvent } from './git-events';

describe('extractItemKeys', () => {
  it('anahtarları bulur, tekrarları atar, sıra korunur', () => {
    expect(extractItemKeys('MOB-12 düzelt, ayrıca WEB-3 ve MOB-12; feature/PRJ-142-giris')).toEqual(
      [
        { prefix: 'MOB', number: 12 },
        { prefix: 'WEB', number: 3 },
        { prefix: 'PRJ', number: 142 },
      ],
    );
  });
  it('küçük harf, tek harf önek ve gömülü metni yok sayar', () => {
    expect(extractItemKeys('mob-12 A-1 XMOB-12x ABC_DEF-5')).toEqual([]);
    expect(extractItemKeys('fix(MOB-7): hata')).toEqual([{ prefix: 'MOB', number: 7 }]);
  });
});

describe('parseGithubEvent', () => {
  it('push: her commit ayrı olay', () => {
    const events = parseGithubEvent('push', {
      repository: { full_name: 'acme/app' },
      commits: [
        {
          id: 'abc1234567',
          message: 'MOB-1 giriş\n\ndetay',
          url: 'https://x/c/1',
          author: { name: 'Elif' },
        },
        { id: 'def', message: 'başka', url: 'u' },
      ],
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      kind: 'COMMIT',
      repo: 'acme/app',
      externalId: 'abc1234567',
      title: 'MOB-1 giriş',
      author: 'Elif',
    });
  });
  it('pull_request: durum birleşti/kapandı/açık', () => {
    const base = { repository: { full_name: 'a/b' } };
    const open = parseGithubEvent('pull_request', {
      ...base,
      pull_request: {
        number: 5,
        title: 'MOB-2 PR',
        state: 'open',
        html_url: 'u',
        user: { login: 'e' },
        head: { ref: 'feature/MOB-3' },
      },
    })[0]!;
    expect(open).toMatchObject({
      kind: 'PULL_REQUEST',
      externalId: '5',
      state: 'OPEN',
      author: 'e',
    });
    expect(open.text).toContain('feature/MOB-3');
    const merged = parseGithubEvent('pull_request', {
      ...base,
      pull_request: { number: 5, title: 't', state: 'closed', merged: true },
    })[0]!;
    expect(merged.state).toBe('MERGED');
    expect(
      parseGithubEvent('pull_request', {
        ...base,
        pull_request: { number: 5, title: 't', state: 'closed' },
      })[0]!.state,
    ).toBe('CLOSED');
  });
  it('tanınmayan olay ve eksik veri boş döner', () => {
    expect(parseGithubEvent('ping', {})).toEqual([]);
    expect(parseGithubEvent('push', { commits: [{ id: 'a' }] })).toEqual([]);
  });
});

describe('parseGitlabEvent', () => {
  it('push ve merge request', () => {
    const push = parseGitlabEvent('Push Hook', {
      project: { path_with_namespace: 'g/p' },
      commits: [{ id: 'aaa', message: 'MOB-9 düzelt', url: 'u', author: { name: 'Ali' } }],
    });
    expect(push[0]).toMatchObject({
      provider: 'GITLAB',
      kind: 'COMMIT',
      repo: 'g/p',
      author: 'Ali',
    });
    const mr = parseGitlabEvent('Merge Request Hook', {
      project: { path_with_namespace: 'g/p' },
      user: { username: 'ali' },
      object_attributes: {
        iid: 7,
        title: 'MOB-9 MR',
        state: 'merged',
        url: 'u',
        description: 'ayrıntı',
        source_branch: 'x',
      },
    })[0]!;
    expect(mr).toMatchObject({ kind: 'PULL_REQUEST', externalId: '7', state: 'MERGED' });
    expect(parseGitlabEvent('Issue Hook', {})).toEqual([]);
  });
});
