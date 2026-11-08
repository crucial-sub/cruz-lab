// 임베드 주소 판정 테스트 (재건 3단계 D3·D10)
import { describe, expect, it } from 'vitest';
import { detectEmbed } from '@/lib/content/embed-url';

describe('detectEmbed', () => {
  it('YouTube 주소 세 형식을 같은 ID로 읽는다', () => {
    const urls = [
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s',
      'https://youtube.com/shorts/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    ];
    for (const url of urls) {
      const info = detectEmbed(url);
      expect(info, url).not.toBeNull();
      expect(info?.provider).toBe('youtube');
      expect(info?.id).toBe('dQw4w9WgXcQ');
      expect(info?.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
      expect(info?.url).toBe(url);
    }
  });

  it('CodeSandbox 주소 세 형식을 읽는다', () => {
    expect(detectEmbed('https://codesandbox.io/s/new')).toMatchObject({
      provider: 'codesandbox',
      id: 'new',
      embedUrl: 'https://codesandbox.io/embed/new',
    });
    expect(detectEmbed('https://codesandbox.io/p/sandbox/abc123')).toMatchObject({ id: 'abc123' });
    expect(detectEmbed('https://codesandbox.io/embed/xyz-789?fontsize=14')).toMatchObject({
      id: 'xyz-789',
    });
  });

  it('그 밖의 주소와 잘못된 주소는 null이다', () => {
    expect(detectEmbed('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(detectEmbed('https://www.youtube.com/channel/UC123')).toBeNull();
    expect(detectEmbed('https://youtu.be/')).toBeNull();
    expect(detectEmbed('https://codesandbox.io/')).toBeNull();
    expect(detectEmbed('ftp://youtu.be/dQw4w9WgXcQ')).toBeNull();
    expect(detectEmbed('주소 아님')).toBeNull();
    expect(detectEmbed('https://evil.example/youtu.be/dQw4w9WgXcQ')).toBeNull();
  });
});

describe('detectEmbed 적대 입력', () => {
  it('호스트 위장과 경로 조작은 null이다', () => {
    for (const url of [
      'https://youtu.be@evil.com/dQw4w9WgXcQ',
      'https://evil.com#@youtu.be/dQw4w9WgXcQ',
      'https://youtu.be.evil.com/dQw4w9WgXcQ',
      'https://youtu.bе/dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=../../x',
      'https://www.youtube.com/watch?v=dQw4w9WgXc',
      'https://codesandbox.io/s/../evil',
      'https://codesandbox.io.evil.com/s/new',
    ]) {
      expect(detectEmbed(url), url).toBeNull();
    }
  });

  it('대문자 스킴과 호스트도 같은 ID로 읽는다', () => {
    expect(detectEmbed('HTTPS://YOUTU.BE/dQw4w9WgXcQ')?.embedUrl).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });
});
