// 공유 파이프라인의 그림·영상 주소 바꾸기 옵션 테스트 (서가 1단계 Plan J12)
// - 옵션이 없으면 결과가 지금과 같다(블로그 렌더 결과가 바뀌지 않는다, 8.3 C5).
// - 옵션이 있으면 그림(img)·영상(video)의 주소를 바꾼다. 링크는 바꾸지 않는다.
// - defer가 참이면 주소를 src 대신 data-src에 둔다(서가 md 뷰어가 문서 쿠키를 받은 뒤 src로 옮긴다).
import { describe, expect, it } from 'vitest';
import { markdownToHtml } from '@/lib/content/markdown';

const prefix = (url: string) => `https://raw.example/d/doc/${url}`;
// 상대 주소만 바꾸고 나머지는 그대로 두는 가짜 바꾸기 함수
const relativeOnly = (url: string) => (/^[a-z]+:/i.test(url) ? null : prefix(url));

describe('mediaUrl 옵션이 없을 때 (블로그)', () => {
  it('그림과 영상 주소가 그대로다', () => {
    expect(markdownToHtml('![a](img/a.png)')).toBe(
      '<p><img src="img/a.png" alt="a" loading="lazy" decoding="async"></p>',
    );
    expect(markdownToHtml('![v](clip.mp4)')).toContain('<video src="clip.mp4"');
  });
});

describe('mediaUrl 옵션이 있을 때 (서가 md 뷰어)', () => {
  it('md 그림 주소를 바꾼다', () => {
    const html = markdownToHtml('![a](img/a.png)', { mediaUrl: { rewrite: relativeOnly } });
    expect(html).toBe(
      '<p><img src="https://raw.example/d/doc/img/a.png" alt="a" loading="lazy" decoding="async"></p>',
    );
  });

  it('바꾸기 함수가 null을 주면 주소를 그대로 둔다', () => {
    const html = markdownToHtml('![a](https://cdn.example/a.png)', {
      mediaUrl: { rewrite: relativeOnly },
    });
    expect(html).toContain('src="https://cdn.example/a.png"');
  });

  it('영상(영상 확장자 그림)과 md 안의 <img> 태그도 바꾼다', () => {
    const html = markdownToHtml('![v](clip.mp4)\n\n<img src="b.png" alt="b">', {
      mediaUrl: { rewrite: relativeOnly },
    });
    expect(html).toContain('<video src="https://raw.example/d/doc/clip.mp4"');
    expect(html).toContain('<img src="https://raw.example/d/doc/b.png"');
  });

  it('링크 주소는 바꾸지 않는다', () => {
    const html = markdownToHtml('[원본](img/a.png)', { mediaUrl: { rewrite: relativeOnly } });
    expect(html).toBe('<p><a href="img/a.png">원본</a></p>');
  });

  it('안전하지 않아 비운 주소는 바꾸기 함수에 넘기지 않는다', () => {
    const seen: string[] = [];
    markdownToHtml('![x](javascript:alert(1))', {
      mediaUrl: {
        rewrite: (url) => {
          seen.push(url);
          return prefix(url);
        },
      },
    });
    expect(seen).toEqual([]);
  });

  it('defer가 참이면 바꾼 주소를 src 대신 data-src에 둔다', () => {
    const html = markdownToHtml('![a](img/a.png)\n\n![v](clip.mp4)', {
      mediaUrl: { rewrite: relativeOnly, defer: true },
    });
    expect(html).toContain(
      '<img alt="a" loading="lazy" decoding="async" data-src="https://raw.example/d/doc/img/a.png">',
    );
    expect(html).toContain('data-src="https://raw.example/d/doc/clip.mp4"');
    expect(html).not.toContain(' src="https://raw.example');
  });

  // PR #36 리뷰(Codex): md 안의 원시 HTML 영상은 <source>와 poster로 주소를 줄 수 있다
  it('영상·소리 안의 <source> 주소와 영상의 poster 주소도 바꾼다', () => {
    const html = markdownToHtml(
      '<video controls poster="cover.jpg"><source src="clip.mp4" type="video/mp4"></video>\n\n' +
        '<audio controls><source src="a.mp3"></audio>\n\n<audio src="b.mp3"></audio>',
      { mediaUrl: { rewrite: relativeOnly } },
    );
    expect(html).toContain('poster="https://raw.example/d/doc/cover.jpg"');
    expect(html).toContain('<source src="https://raw.example/d/doc/clip.mp4" type="video/mp4">');
    expect(html).toContain('<source src="https://raw.example/d/doc/a.mp3">');
    expect(html).toContain('<audio src="https://raw.example/d/doc/b.mp3">');
  });

  it('defer가 참이면 <source>는 data-src, poster는 data-poster에 둔다', () => {
    const html = markdownToHtml(
      '<video controls poster="cover.jpg"><source src="clip.mp4" type="video/mp4"></video>',
      { mediaUrl: { rewrite: relativeOnly, defer: true } },
    );
    expect(html).toContain('data-poster="https://raw.example/d/doc/cover.jpg"');
    expect(html).toContain('<source type="video/mp4" data-src="https://raw.example/d/doc/clip.mp4">');
    expect(html).not.toContain(' poster=');
    expect(html).not.toContain(' src="https://raw.example');
  });

  it('영상·소리 밖의 <source>(picture)와 바깥 poster는 바꾸지 않는다', () => {
    const html = markdownToHtml(
      '<picture><source src="p.png"><img src="https://cdn.example/a.png"></picture>\n\n' +
        '<video src="https://cdn.example/v.mp4" poster="https://cdn.example/c.jpg"></video>',
      { mediaUrl: { rewrite: relativeOnly, defer: true } },
    );
    expect(html).toContain('<source src="p.png">');
    expect(html).toContain('poster="https://cdn.example/c.jpg"');
    expect(html).not.toContain('data-poster');
  });

  it('defer여도 바꾸지 않은 주소는 src에 그대로 둔다', () => {
    const html = markdownToHtml('![a](https://cdn.example/a.png)', {
      mediaUrl: { rewrite: relativeOnly, defer: true },
    });
    expect(html).toContain('src="https://cdn.example/a.png"');
    expect(html).not.toContain('data-src');
  });
});
