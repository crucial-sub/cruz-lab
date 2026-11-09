// 코드 하이라이트·코드 블록 틀 테스트 (재건 4단계 D8)
import { describe, expect, it } from 'vitest';
import { CODE_LANGUAGES } from '@/lib/content/code-languages';
import { createSiteHighlighter } from '@/lib/content/highlighter';
import { markdownToHtml, renderMarkdown } from '@/lib/content/markdown';
import { PLAIN_LANGUAGE, resolveShikiLanguage } from '@/lib/content/shiki-languages';

const highlighter = createSiteHighlighter();
const LOADED = new Set(['javascript', 'js', 'objective-c', 'objc', 'asm', 'python', 'py']);

describe('resolveShikiLanguage (별칭)', () => {
  it('기존 글 이름 objectivec·nasm을 Shiki 이름으로 바꾼다', () => {
    expect(resolveShikiLanguage('objectivec', LOADED)).toBe('objective-c');
    expect(resolveShikiLanguage('nasm', LOADED)).toBe('asm');
  });

  it('Shiki 기본 별칭과 대소문자를 받는다', () => {
    expect(resolveShikiLanguage('js', LOADED)).toBe('js');
    expect(resolveShikiLanguage('JavaScript', LOADED)).toBe('javascript');
    expect(resolveShikiLanguage(' py ', LOADED)).toBe('py');
  });

  it('모르는 언어와 언어 없음은 민무늬(text)다', () => {
    expect(resolveShikiLanguage('brainfuck', LOADED)).toBe(PLAIN_LANGUAGE);
    expect(resolveShikiLanguage(null, LOADED)).toBe(PLAIN_LANGUAGE);
    expect(resolveShikiLanguage('', LOADED)).toBe(PLAIN_LANGUAGE);
  });
});

describe('createSiteHighlighter', () => {
  // 언어마다 토큰이 여럿 생기는 짧은 예시. 그 밖 언어는 C 계열 예시를 쓴다
  const SAMPLES: Record<string, string> = {
    html: '<div class="a">x</div>',
    css: 'a { color: red; }',
    markdown: '# 제목\n\n**굵게**',
    nasm: 'mov eax, 1',
    bash: 'echo "a" | grep a',
    sh: 'echo "a" | grep a',
    shell: 'echo "a" | grep a',
    json: '{ "a": 1 }',
    yaml: 'a: 1',
    sql: 'SELECT a FROM b;',
    python: 'def f(a): return 1',
    py: 'def f(a): return 1',
  };

  it('드롭다운 언어 20종과 기존 글 별칭이 모두 색칠된다', () => {
    const names = [...CODE_LANGUAGES.map((item) => item.value), 'js', 'ts', 'py', 'sh', 'shell'];
    expect(CODE_LANGUAGES).toHaveLength(20);
    for (const name of names) {
      const sample = SAMPLES[name] ?? 'if (a) { return 1; }';
      const html = markdownToHtml(`\`\`\`${name}\n${sample}\n\`\`\``, { highlighter });
      // 색이 다른 토큰이 둘 이상이면 색칠된 것이다 (민무늬는 style 없는 span 하나)
      const colors = new Set(html.match(/--shiki-dark:#[0-9A-Fa-f]+/g) ?? []);
      expect(colors.size, name).toBeGreaterThan(1);
    }
  });

  it('듀얼 테마 CSS 변수만 쓰고 color 속성을 직접 쓰지 않는다', () => {
    const html = markdownToHtml('```js\nconst a = 1;\n```', { highlighter });
    expect(html).toContain('class="shiki shiki-themes github-light-default github-dark-default"');
    expect(html).toContain('--shiki-light:');
    expect(html).toContain('--shiki-dark:');
    expect(html).not.toMatch(/style="color:/);
  });

  it('끝 줄바꿈 때문에 빈 줄이 하나 더 생기지 않는다', () => {
    const pre = highlighter.toPre('a\nb\n', 'text');
    const html = markdownToHtml('```\na\nb\n```', { highlighter });
    expect(html.match(/class="line"/g)).toHaveLength(2);
    expect(pre.tagName).toBe('pre');
  });

  it('모르는 언어는 민무늬 Shiki 블록이고 라벨은 원래 이름이다', () => {
    const html = markdownToHtml('```brainfuck\n+++\n```', { highlighter });
    expect(html).toContain('data-lang="brainfuck"');
    expect(html).toContain('<span class="code-lang">brainfuck</span>');
    expect(html).not.toContain('<span style="--shiki-light:');
    expect(html).toContain('+++');
  });

  it('코드 안의 HTML 글자는 이스케이프된다', () => {
    const html = markdownToHtml('```html\n<script>alert(1)</script>\n```', { highlighter });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&#x3C;');
  });
});

describe('코드 블록 틀', () => {
  it('언어·파일 이름(meta)·숨은 복사 버튼', () => {
    const html = markdownToHtml('```ts app.ts\nlet a = 1;\n```', { highlighter });
    expect(html).toContain('<figure class="code-block" data-lang="ts">');
    expect(html).toContain(
      '<span class="code-label"><span class="code-lang">ts</span><span class="code-meta">app.ts</span></span>',
    );
    expect(html).toContain(
      '<button type="button" class="code-copy" aria-label="ts 코드 복사" hidden>복사</button>',
    );
    // meta는 틀 라벨로만 나가고 코드 요소의 속성으로 남지 않는다
    expect(html).not.toContain('data-meta');
  });

  it('하이라이터가 없어도 meta 속성은 남지 않는다', () => {
    expect(markdownToHtml('```ts app.ts\nlet a = 1;\n```')).not.toContain('data-meta');
  });

  it('언어가 없으면 라벨이 비고 data-lang은 빈 값이다', () => {
    const html = markdownToHtml('```\nplain\n```', { highlighter });
    expect(html).toContain('<figure class="code-block" data-lang="">');
    expect(html).toContain('<span class="code-label"></span>');
  });

  it('펜스 코드 수만큼 틀이 생긴다 (목록·인용 안 포함). 블록 수식과 인라인 코드는 틀이 없다', () => {
    const md = [
      '```js\na\n```',
      '- 항목\n\n  ```py\n  b\n  ```',
      '> ```\n> c\n> ```',
      '$$\nx^2\n$$',
      '```math\ny\n```',
      '`인라인`',
    ].join('\n\n');
    const { html, hasMath } = renderMarkdown(md, { highlighter });
    expect(html.match(/<figure class="code-block"/g)).toHaveLength(3);
    expect(hasMath).toBe(true);
  });

  it('원시 HTML의 button은 지우고 틀의 button만 남는다', () => {
    const html = markdownToHtml('<button onclick="x()">나쁜 버튼</button>\n\n```js\na\n```', {
      highlighter,
    });
    expect(html).not.toContain('나쁜 버튼</button>');
    expect(html.match(/<button/g)).toHaveLength(1);
  });
});

describe('리뷰 지적 (경미 6·7)', () => {
  it('원시 HTML 코드 블록의 <br>은 줄바꿈으로 하이라이트한다', () => {
    const html = markdownToHtml('<pre><code class="language-js">a<br>b</code></pre>', {
      highlighter,
    });
    expect(html.match(/class="line"/g)).toHaveLength(2);
  });

  it('하이라이터가 실패하면 그 블록만 민무늬로 둔다', () => {
    const broken = {
      toPre: () => {
        throw new Error('하이라이트 실패');
      },
    };
    const html = markdownToHtml('```js\nconst a = 1;\n```', { highlighter: broken });
    expect(html).toContain('<figure class="code-block" data-lang="js">');
    expect(html).toContain('<pre><code class="language-js">const a = 1;\n</code></pre>');
  });

  it('복사 버튼은 언어를 넣은 접근 이름을 갖는다 (경미 11)', () => {
    expect(markdownToHtml('```ts\na\n```', { highlighter })).toContain('aria-label="ts 코드 복사"');
    expect(markdownToHtml('```\na\n```', { highlighter })).toContain('aria-label="코드 복사"');
  });
});
