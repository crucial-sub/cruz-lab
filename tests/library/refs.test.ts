// 문서 안 상대 주소 찾기 테스트 (서가 1단계 T3, Plan J15)
import { describe, expect, it } from 'vitest';
import { countHtmlDocLinks, findCssRefs, findHtmlRefs, findMarkdownRefs, missingRefs, resolveRef } from '@/library/refs';

describe('resolveRef: 상대 주소 하나를 문서 안 경로로', () => {
  it('바깥 주소는 external', () => {
    for (const ref of [
      'https://x.com/a.png',
      'http://x.com/a.png',
      '//cdn.x.com/a.js',
      'data:image/png;base64,AAAA',
      'mailto:a@b.c',
      'javascript:void(0)',
      'blob:abc',
      '#section',
      '',
      '  ',
    ]) {
      expect(resolveRef('', ref).kind, ref).toBe('external');
    }
  });

  it('질의 문자열과 조각을 떼고, 퍼센트 인코딩을 푼다', () => {
    expect(resolveRef('', 'shots/a%20b.png?v=2#x')).toEqual({ kind: 'local', path: 'shots/a b.png' });
    expect(resolveRef('', './a.css')).toEqual({ kind: 'local', path: 'a.css' });
  });

  it('기준 폴더에서 ../ 를 푼다. 문서 밖으로 나가면 outside', () => {
    expect(resolveRef('css', '../img/a.png')).toEqual({ kind: 'local', path: 'img/a.png' });
    expect(resolveRef('', '../a.png')).toEqual({ kind: 'outside', ref: '../a.png' });
    expect(resolveRef('a', '../../b.png')).toEqual({ kind: 'outside', ref: '../../b.png' });
  });

  it('/ 로 시작하는 주소는 outside (문서 출처의 뿌리는 문서 밖이다)', () => {
    expect(resolveRef('', '/img/a.png')).toEqual({ kind: 'outside', ref: '/img/a.png' });
  });

  it('NFD 이름을 NFC로 맞춘다', () => {
    expect(resolveRef('', '그림.png'.normalize('NFD'))).toEqual({ kind: 'local', path: '그림.png'.normalize('NFC') });
  });

  it('템플릿 자리표시는 external로 본다', () => {
    expect(resolveRef('', '${src}').kind).toBe('external');
    expect(resolveRef('', '{{ img }}').kind).toBe('external');
  });
});

describe('findHtmlRefs (J15)', () => {
  it('src, href(link), poster, srcset, style url()을 자산으로 찾는다', () => {
    const html = `<!doctype html><html><head>
<link rel="stylesheet" href="style.css">
<link rel="icon" href="data:image/svg+xml,abc">
<link href="https://fonts.googleapis.com/css2?family=X" rel="stylesheet">
<style>.hero{background:url("img/hero.png")} @import 'more.css';</style>
<script src="app.js"></script>
</head><body>
<img src="cruz-lab-audit-assets/home-desktop.png" alt="">
<img srcset="a-480.webp 480w, a-960.webp 960w" src="a.webp">
<video poster="v.jpg" controls><source src="clip.mp4" type="video/mp4"></video>
<div style="background-image: url('bg.png')"></div>
<svg><use href="#icon"/><image href="pic.svg"/><use xlink:href="sprite.svg#a"/></svg>
<a href="scene.html?mood=a&amp;scene=perfect">장면</a>
<a href="https://www.youtube.com/watch?v=x">외부</a>
<a href="#top">위로</a>
</body></html>`;
    const r = findHtmlRefs(html);
    expect(r.assets).toEqual([
      'style.css',
      'img/hero.png',
      'more.css',
      'app.js',
      'cruz-lab-audit-assets/home-desktop.png',
      'a-480.webp',
      'a-960.webp',
      'a.webp',
      'v.jpg',
      'clip.mp4',
      'bg.png',
      'pic.svg',
      'sprite.svg',
    ]);
    expect(r.links).toEqual(['scene.html']);
    expect(r.outside).toEqual([]);
  });

  it('주석과 스크립트 본문 안의 태그 모양은 무시한다', () => {
    const html = `<!-- <img src="old.png"> -->
<script>const t = '<img src="in-script.png">'; el.innerHTML = \`<img src="\${x}">\`;</script>
<script type="module" src="./main.js"></script>
<img src="real.png">`;
    expect(findHtmlRefs(html).assets).toEqual(['main.js', 'real.png']);
  });

  it('같은 주소는 한 번만, 문서 밖 주소는 outside로', () => {
    const html = `<img src="a.png"><img src="./a.png"><img src="../up.png"><img src="/root.png">`;
    const r = findHtmlRefs(html);
    expect(r.assets).toEqual(['a.png']);
    expect(r.outside).toEqual(['../up.png', '/root.png']);
  });

  it('따옴표 없는 속성과 대문자 태그도 읽는다', () => {
    expect(findHtmlRefs('<IMG SRC=pic.png><Img src = "b.png">').assets).toEqual(['pic.png', 'b.png']);
  });

  it('기준 폴더를 받는다 (폴더 안 html)', () => {
    expect(findHtmlRefs('<img src="../shots/a.png">', 'pages').assets).toEqual(['shots/a.png']);
  });

  it('srcset에서 설명자 없이 쉼표로 끝난 후보 뒤의 후보도 찾는다 (PR #35 리뷰)', () => {
    expect(findHtmlRefs('<img srcset="a.png, b.png 2x">').assets).toEqual(['a.png', 'b.png']);
    expect(findHtmlRefs('<img srcset="a.png, b.png 2x, c.png,  d.png 3x">').assets).toEqual(['a.png', 'b.png', 'c.png', 'd.png']);
  });

  it('srcset의 data: 주소 쉼표에 속지 않는다', () => {
    expect(findHtmlRefs('<img srcset="data:image/png;base64,AA,BB 1x, b.png 2x">').assets).toEqual(['b.png']);
  });
});

describe('findCssRefs', () => {
  it('url()과 @import를 찾고 기준 폴더로 푼다', () => {
    const css = `@import url("base.css"); @import 'theme.css';
.a { background: url(../img/a.png) } .b { mask: url( 'b.svg#m' ) }
@font-face { src: url(font.woff2) format('woff2'), url("https://x/f.woff") }
.c { background: url(data:image/png;base64,AA) }`;
    const r = findCssRefs(css, 'css');
    expect(r.assets).toEqual(['css/base.css', 'css/theme.css', 'img/a.png', 'css/b.svg', 'css/font.woff2']);
    expect(r.links).toEqual([]);
  });
});

describe('findMarkdownRefs', () => {
  it('이미지와 html img는 자산, 문서 링크는 links', () => {
    const md = `# 제목
![그림](img/a.png "제목")
![참조 그림][fig]
<img src="img/b.png" width="300">
[다른 문서](other.md) [외부](https://x.com)
\`![코드 안](no.png)\`

\`\`\`md
![블록 안](no2.png)
\`\`\`

[fig]: img/c.png`;
    const r = findMarkdownRefs(md);
    expect(r.assets).toEqual(['img/a.png', 'img/b.png', 'img/c.png']);
    expect(r.links).toEqual(['other.md']);
  });

  it('긴 펜스 안의 짧은 펜스는 코드다 (PR #35 리뷰)', () => {
    const md = ['````md', '```', '![예시](missing.png)', '````', '![진짜](real.png)'].join('\n');
    expect(findMarkdownRefs(md).assets).toEqual(['real.png']);
    expect(findMarkdownRefs(['```', '```js', '![안](in.png)', '```', '![밖](out.png)'].join('\n')).assets).toEqual(['out.png']);
  });

  it('꺾쇠로 감싼 주소와 공백 이름을 읽는다', () => {
    expect(findMarkdownRefs('![a](<shots/a b.png>)').assets).toEqual(['shots/a b.png']);
  });
});

describe('missingRefs', () => {
  it('올리는 목록에 없는 자산만 돌려준다 (NFC로 비교)', () => {
    const present = ['index.html', '그림.png'.normalize('NFC'), 'a.css'];
    expect(missingRefs(['a.css', '그림.png'.normalize('NFD'), 'b.png'], present)).toEqual(['b.png']);
  });
});

// ---------- 문서 사이 HTML 링크 수 (폴더 2차 Plan J70) ----------

describe('countHtmlDocLinks', () => {
  const isDoc = (path: string) => ['b.html', 'c.md', 'sub/d.html'].includes(path);

  it('같은 대상도 링크마다 센다 (findHtmlRefs().links는 한 번만 센다)', () => {
    const html = '<a href="b.html">1</a><p><a href="b.html">2</a></p><a href="c.md">3</a>';
    expect(countHtmlDocLinks(html, isDoc)).toBe(3);
    expect(findHtmlRefs(html).links).toHaveLength(2);
  });

  it('#조각·?쿼리가 붙은 주소도 그 문서로 센다', () => {
    expect(countHtmlDocLinks('<a href="b.html#x">1</a><a href="b.html?v=1">2</a>', isDoc)).toBe(2);
  });

  it('문서가 아닌 대상, 다른 서버, 자기 조각은 세지 않는다', () => {
    const html = '<a href="x.png">1</a><a href="https://e.com/b.html">2</a><a href="#top">3</a>';
    expect(countHtmlDocLinks(html, isDoc)).toBe(0);
  });

  it('주석과 script 안의 링크 모양은 세지 않는다', () => {
    const html = '<!-- <a href="b.html">1</a> --><script>const s = \'<a href="b.html">2</a>\';</script>';
    expect(countHtmlDocLinks(html, isDoc)).toBe(0);
  });

  it('a가 아닌 태그의 href는 세지 않는다', () => {
    expect(countHtmlDocLinks('<link rel="next" href="b.html">', isDoc)).toBe(0);
  });

  it('하위 폴더 대상과 작은따옴표 주소도 센다', () => {
    expect(countHtmlDocLinks("<a href='sub/d.html'>1</a>", isDoc)).toBe(1);
  });
});
