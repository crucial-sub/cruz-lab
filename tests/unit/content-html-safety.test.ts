// 공유 파이프라인 HTML 안전 처리와 영상 주소 판정 (재건 3단계 리뷰 6.2 지적 10·11)
import { describe, expect, it } from 'vitest';
import { isVideoUrl, markdownToHtml } from '@/lib/content/markdown';

describe('isVideoUrl (지적 10)', () => {
  it('확장자로 끝나는 주소는 영상이다', () => {
    expect(isVideoUrl('https://x.dev/a.webm')).toBe(true);
    expect(isVideoUrl('https://x.dev/a.MP4')).toBe(true);
  });

  it('Firebase 다운로드 주소처럼 쿼리·해시가 붙어도 경로 확장자로 판정한다', () => {
    const url =
      'https://firebasestorage.googleapis.com/v0/b/b/o/assets%2Fabc%2Foriginal.mp4?alt=media&token=t';
    expect(isVideoUrl(url)).toBe(true);
    expect(isVideoUrl('/clip.mov#t=3')).toBe(true);
  });

  it('이미지·확장자 없는 주소는 영상이 아니다', () => {
    expect(isVideoUrl('https://x.dev/a.webp?x=.mp4')).toBe(false);
    expect(isVideoUrl('https://x.dev/video')).toBe(false);
  });

  it('미리보기도 쿼리 붙은 영상 주소를 video로 그린다', () => {
    const html = markdownToHtml(
      '![clip](https://firebasestorage.googleapis.com/v0/b/b/o/assets%2Fabc%2Foriginal.webm?alt=media&token=t)',
    );
    expect(html).toContain('<video');
  });
});

describe('markdownToHtml 원시 HTML 안전 처리 (지적 11)', () => {
  it('on* 이벤트 속성을 지운다', () => {
    const html = markdownToHtml(
      '<img src="x.png" onerror="alert(1)">\n\n<details open ontoggle="alert(1)">x</details>',
    );
    expect(html).not.toMatch(/onerror|ontoggle/i);
    expect(html).toContain('<img');
  });

  it('script·style·form·object·embed·base·meta와 허용 밖 iframe을 지운다', () => {
    const inputs = [
      '<script>alert(1)</script>',
      '<style>body{}</style>',
      '<form action="javascript:alert(1)"><button>x</button></form>',
      '<object data="x"></object>',
      '<embed src="x">',
      '<base href="https://evil.example">',
      '<meta http-equiv="refresh" content="0;url=https://evil.example">',
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
      '<iframe src="https://evil.example/embed/x"></iframe>',
    ];
    for (const input of inputs) {
      const html = markdownToHtml(input);
      expect(html, input).not.toMatch(
        /<(script|style|form|button|object|embed|base|meta|iframe)\b/i,
      );
      expect(html, input).not.toMatch(/javascript:|srcdoc/i);
    }
  });

  it('svg 안의 javascript: 링크와 애니메이션 요소를 지운다', () => {
    const html = markdownToHtml(
      '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a><animate attributeName="href" to="javascript:alert(1)"/></svg>',
    );
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/<animate/i);
  });

  it('임베드 iframe(허용 호스트)과 KaTeX의 style 속성은 남긴다', () => {
    const embed = markdownToHtml('https://youtu.be/dQw4w9WgXcQ');
    expect(embed).toContain('<iframe');
    expect(embed).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(embed).toContain('sandbox=');
    const math = markdownToHtml('$$\n\\frac{a}{b}\n$$');
    expect(math).toContain('class="katex');
    expect(math).toMatch(/style="/);
  });

  it('원시 HTML로 넣은 허용 호스트 iframe은 안전한 속성만 남긴다', () => {
    const html = markdownToHtml(
      '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" onload="alert(1)" allow="camera"></iframe>',
    );
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(html).not.toMatch(/onload|allow="camera"/);
    expect(html).toContain('sandbox=');
  });

  it('할 일 목록의 체크 상자만 남긴다. 늘 disabled이고 type·checked 말고는 지운다 (4단계 PR-B 리뷰 중요 2)', () => {
    const html = markdownToHtml('- [ ] 할 일\n- [x] 끝난 일');
    expect(html).toContain('class="contains-task-list"');
    expect(html).toMatch(/<li class="task-list-item"><input type="checkbox" disabled> 할 일<\/li>/);
    expect(html).toMatch(/<li class="task-list-item"><input type="checkbox" checked disabled> 끝난 일<\/li>/);
    // 원시 HTML 체크 상자도 같은 속성만 남는다
    const raw = markdownToHtml('<input type="checkbox" name="x" form="f" onclick="alert(1)" autofocus>');
    expect(raw).toContain('<input type="checkbox" disabled>');
    expect(raw).not.toMatch(/onclick|name=|form=|autofocus/);
    // 체크 상자가 아닌 input은 지운다
    for (const input of ['<input type="text" value="x">', '<input type="image" src="javascript:alert(1)">', '<input>']) {
      expect(markdownToHtml(input), input).not.toContain('<input');
    }
  });
});
