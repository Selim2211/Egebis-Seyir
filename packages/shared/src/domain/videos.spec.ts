import { describe, expect, it } from 'vitest';
import { formatBytes, looksLikeVideo, videoMimeOf } from './videos';

describe('video arşivi kuralları', () => {
  it('yalnızca tarayıcıda oynatılabilen uzantıları kabul eder', () => {
    expect(videoMimeOf('demo.MP4')).toBe('video/mp4');
    expect(videoMimeOf('kayıt.mov')).toBe('video/quicktime');
    expect(videoMimeOf('a.webm')).toBe('video/webm');
    expect(videoMimeOf('film.mkv')).toBeNull();
    expect(videoMimeOf('sayfa.html')).toBeNull();
    expect(videoMimeOf('uzantisiz')).toBeNull();
  });

  it('içerik imzasını doğrular', () => {
    const mp4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01]);
    const html = new TextEncoder().encode('<html><script>');
    expect(looksLikeVideo('video/mp4', mp4)).toBe(true);
    expect(looksLikeVideo('video/quicktime', mp4)).toBe(true);
    expect(looksLikeVideo('video/webm', webm)).toBe(true);
    expect(looksLikeVideo('video/mp4', html)).toBe(false);
    expect(looksLikeVideo('video/webm', mp4)).toBe(false);
  });

  it('boyutu okunur yazar', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.5 GB');
    expect(formatBytes(250 * 1024 ** 2)).toBe('250 MB');
  });
});
