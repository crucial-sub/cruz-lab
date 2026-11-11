// 서버 코드 하이라이터 테스트 (재건 5단계 T13, Plan D16, 사용자 결정 2026-11-11)
// - 글에 나온 언어만 불러오는지, 펜스 언어 → 문법 파일 표가 문법 파일과 같은지,
//   서버(Oniguruma)와 에디터 미리보기(JS 엔진)의 결과가 같은지, 실패해도 글을 그리는지 본다.
// - 서버 하이라이터는 모듈 상태(불러온 언어)를 가진다. 결과가 앞서 불러온 언어에 따라 바뀌지 않는지 보려고
//   비교는 언어마다 모듈을 새로 읽은 상태에서 한다(리뷰 S8).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CODE_LANGUAGES } from '@/lib/content/code-languages';
import { createSiteHighlighter } from '@/lib/content/highlighter';
import { markdownToHtml } from '@/lib/content/markdown';
import {
  grammarForLanguage,
  grammarsInMarkdown,
  LAZY_EMBEDDING_GRAMMARS,
  SITE_GRAMMAR_NAMES,
  SITE_GRAMMARS,
  type SiteGrammar,
} from '@/lib/content/shiki-languages';
import { GRAMMAR_LOADERS } from '@/lib/server/code-highlighter';

type ServerModule = typeof import('@/lib/server/code-highlighter');

// 모듈 상태가 빈 서버 하이라이터 모듈
async function freshServer(): Promise<ServerModule> {
  vi.resetModules();
  return import('@/lib/server/code-highlighter');
}

// 서버 하이라이터로 그린 HTML (새 상태)
async function serverHtml(markdown: string): Promise<string> {
  const { getServerHighlighter } = await freshServer();
  const highlighter = await getServerHighlighter(markdown);
  if (!highlighter) throw new Error('서버 하이라이터를 만들지 못했다');
  return markdownToHtml(markdown, { highlighter });
}

// 문법 파일 자신의 등록. 운영과 같은 GRAMMAR_LOADERS로 읽는다(리뷰 B4)
// - 문법 파일은 포함하는 언어를 앞에, 자신을 마지막에 둔다(html.mjs = [javascript, css, html]).
async function ownGrammar(grammar: SiteGrammar) {
  const registrations = (await GRAMMAR_LOADERS[grammar]()).default;
  return registrations[registrations.length - 1];
}

afterEach(() => {
  vi.doUnmock('shiki/engine/oniguruma');
  vi.doUnmock('shiki/langs/c.mjs');
  vi.restoreAllMocks();
});

describe('서버 하이라이터: 글에 나온 언어만 불러온다', () => {
  it('C 글을 칠하면 C 문법만 불러온다', async () => {
    const { getServerHighlighter, loadedServerLanguages } = await freshServer();
    const markdown = '```c\nint main(void) { return 0; }\n```';
    const highlighter = await getServerHighlighter(markdown);
    const html = markdownToHtml(markdown, { highlighter: highlighter ?? undefined });
    // 기본 글자색(#E6EDF3)이 아닌 토큰이 있으면 칠한 것이다
    expect(html).toMatch(/--shiki-dark:#(?!E6EDF3)/i);
    const loaded = await loadedServerLanguages();
    expect(loaded).toContain('c');
    expect(loaded).not.toContain('python');
    expect(loaded).not.toContain('javascript');
  });

  it('모르는 언어는 민무늬다', async () => {
    const html = await serverHtml('```brainfuck\n+++\n```');
    expect(html).not.toMatch(/--shiki-dark:#(?!E6EDF3)/i);
  });

  it('사이트 언어라도 이 본문으로 불러오지 않았으면 민무늬다', async () => {
    const { getServerHighlighter } = await freshServer();
    const highlighter = await getServerHighlighter('');
    const html = markdownToHtml('```python\nx = 1\n```', { highlighter: highlighter ?? undefined });
    expect(html).not.toMatch(/--shiki-dark:#(?!E6EDF3)/i);
  });

  it('markdown 블록이 있으면 사이트 문법을 모두 불러온다(늦게 포함하는 언어, 리뷰 S1)', async () => {
    const { getServerHighlighter, loadedServerLanguages } = await freshServer();
    await getServerHighlighter('```md\n# 제목\n```');
    const loaded = new Set(await loadedServerLanguages());
    for (const grammar of SITE_GRAMMARS) expect(loaded.has(SITE_GRAMMAR_NAMES[grammar][0]), grammar).toBe(true);
  });
});

describe('서버 하이라이터: 실패해도 글을 그린다(리뷰 S2)', () => {
  it('엔진을 만들지 못하면 null이다', async () => {
    vi.resetModules();
    vi.doMock('shiki/engine/oniguruma', () => ({
      createOnigurumaEngine: () => Promise.reject(new Error('wasm 실패')),
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getServerHighlighter } = await import('@/lib/server/code-highlighter');
    expect(await getServerHighlighter('```c\nint a;\n```')).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('문법 하나를 불러오지 못하면 그 언어만 민무늬다', async () => {
    vi.resetModules();
    vi.doMock('shiki/langs/c.mjs', () => {
      throw new Error('문법 실패');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getServerHighlighter } = await import('@/lib/server/code-highlighter');
    const markdown = '```c\nint a;\n```\n\n```py\nx = 1\n```';
    const highlighter = await getServerHighlighter(markdown);
    expect(highlighter).not.toBeNull();
    const html = markdownToHtml(markdown, { highlighter: highlighter ?? undefined });
    const [cBlock, pyBlock] = html.split('<figure').slice(1);
    expect(cBlock).not.toMatch(/--shiki-dark:#(?!E6EDF3)/i);
    expect(pyBlock).toMatch(/--shiki-dark:#(?!E6EDF3)/i);
    expect(warn).toHaveBeenCalled();
  });
});

describe('펜스 언어 → 문법 파일', () => {
  it('드롭다운 언어 20종이 문법 파일 20개와 하나씩 맞는다', () => {
    const grammars = CODE_LANGUAGES.map((item) => grammarForLanguage(item.value));
    expect(grammars).not.toContain(null);
    expect(new Set(grammars)).toEqual(new Set(SITE_GRAMMARS));
  });

  it('표의 이름은 문법 파일의 name·aliases와 같다', async () => {
    for (const grammar of SITE_GRAMMARS) {
      const own = await ownGrammar(grammar);
      expect(SITE_GRAMMAR_NAMES[grammar], grammar).toEqual([own.name, ...(own.aliases ?? [])]);
    }
    expect(Object.keys(GRAMMAR_LOADERS).sort()).toEqual([...SITE_GRAMMARS].sort());
  });

  it('사이트 언어를 늦게 포함하는 문법은 LAZY_EMBEDDING_GRAMMARS뿐이다', async () => {
    const siteNames = new Set(SITE_GRAMMARS.flatMap((grammar) => SITE_GRAMMAR_NAMES[grammar]));
    const lazy: string[] = [];
    for (const grammar of SITE_GRAMMARS) {
      const own = await ownGrammar(grammar);
      if ((own.embeddedLangsLazy ?? []).some((name) => siteNames.has(name))) lazy.push(grammar);
    }
    expect(lazy).toEqual([...LAZY_EMBEDDING_GRAMMARS]);
  });

  it('별칭·기존 글 이름·대소문자를 받는다', () => {
    expect(grammarForLanguage('js')).toBe('javascript');
    expect(grammarForLanguage(' Shell ')).toBe('bash');
    expect(grammarForLanguage('shellscript')).toBe('bash');
    expect(grammarForLanguage('objectivec')).toBe('objective-c');
    expect(grammarForLanguage('nasm')).toBe('asm');
    expect(grammarForLanguage('brainfuck')).toBeNull();
    expect(grammarForLanguage('')).toBeNull();
    expect(grammarForLanguage(null)).toBeNull();
  });
});

describe('grammarsInMarkdown', () => {
  it('펜스(```·~~~), 목록·인용 안 펜스, 원시 HTML class를 넉넉히 찾는다', () => {
    const markdown = [
      '```c',
      'int a;',
      '```',
      '',
      '- 목록',
      '  ~~~~py title="a.py"',
      '  x = 1',
      '  ~~~~',
      '',
      '> ```NASM',
      '> mov eax, 1',
      '> ```',
      '',
      '<pre><code class="language-sh">ls</code></pre>',
      '',
      '```brainfuck',
      '+',
      '```',
      '```js',
      '```c',
    ].join('\n');
    expect(grammarsInMarkdown(markdown)).toEqual(['c', 'python', 'asm', 'javascript', 'bash']);
  });

  it('정보 문자열의 역슬래시 이스케이프와 숫자 문자 참조를 푼다(remark와 같게, 리뷰 S7)', () => {
    expect(grammarsInMarkdown('```objective\\-c\nx\n```')).toEqual(['objective-c']);
    expect(grammarsInMarkdown('```&#106;s\nx\n```')).toEqual(['javascript']);
    expect(grammarsInMarkdown('```&#x70;y\nx\n```')).toEqual(['python']);
  });

  it('markdown이 있으면 사이트 문법을 모두 돌려준다', () => {
    expect(grammarsInMarkdown('```markdown\n# a\n```')).toEqual([...SITE_GRAMMARS]);
  });

  it('코드가 없으면 빈 목록이다', () => {
    expect(grammarsInMarkdown('# 제목\n\n본문 `inline`')).toEqual([]);
  });
});

describe('서버(Oniguruma)와 에디터 미리보기(JS 엔진)의 결과', () => {
  // 언어마다 토큰이 여럿 생기는 예시. 그 밖 언어는 C 계열 예시를 쓴다
  const SAMPLES: Record<string, string> = {
    html: '<div class="a">\n  <script>const x = 1;</script>\n  <style>a { color: red; }</style>\n</div>',
    css: 'a:hover { color: red; margin: 0 auto; }',
    // 머리말(yaml)과 안쪽 펜스(js): markdown 문법이 늦게 포함하는 언어다(리뷰 S1)
    markdown: '---\ntitle: a\n---\n\n# 제목\n\n**굵게** `코드` [링크](https://a.b)\n\n````js\nconst a = 1;\n````',
    nasm: 'section .text\nglobal _start\n_start:\n  mov eax, 1 ; 주석\n  int 0x80',
    bash: 'for f in *.md; do echo "$f" | grep -v x; done',
    sh: 'export A=1 && echo $A',
    json: '{ "a": [1, true, null], "b": "c" }',
    yaml: 'a: 1\nb:\n  - "c"\n  - d # 주석',
    python: 'def f(a: int) -> str:\n    """문서"""\n    return f"{a}"',
    py: '@dec\nclass A(B):\n    pass',
    c: '#include <stdio.h>\nint main(void) {\n  printf("%d\\n", 1); /* 주석 */\n  return 0;\n}',
    objectivec: '@interface A : NSObject\n- (void)f:(int)a;\n@end',
    go: 'package main\nfunc main() { fmt.Println("a") }',
    rust: 'fn main() { let v: Vec<i32> = vec![1]; println!("{:?}", v); }',
    swift: 'struct A { let b: Int; func c() -> String { "\\(b)" } }',
    kotlin: 'fun main() { val a = listOf(1); println("$a") }',
    java: 'public class A { public static void main(String[] a) { System.out.println(1); } }',
    typescript: 'type A<T> = { a: T }; const b: A<number> = { a: 1 };',
    tsx: 'export const A = ({ b }: { b: string }) => <div className="c">{b}</div>;',
    jsx: 'export const A = ({ b }) => <div className="c">{b}</div>;',
    javascript: 'const a = async () => { await fetch(`/x/${1}`); };',
  };

  // markdown 예시는 안쪽 펜스가 바깥 펜스보다 짧아야 한다(바깥은 ````` 다섯 개)
  const fence = (name: string, sample: string) =>
    name === 'markdown' ? `\`\`\`\`\`${name}\n${sample}\n\`\`\`\`\`` : `\`\`\`${name}\n${sample}\n\`\`\``;

  // SQL은 비교에서 뺀다: JS 엔진의 `COUNT(` 함수 이름 색이 실행마다 달랐다(민무늬, 밝은 테마만 색, 서버와 같음이
  // 섞여 나왔다. 원인 미확인, 작업 문서 8절). Oniguruma(원본 엔진, VS Code와 같다)는 늘 칠한다. 아래 테스트가 그것을 고정한다.
  // 발행 글 62편(코드 블록 294개)은 두 엔진의 HTML이 같았다(2026-11-11, 작업 문서 5절).
  it('언어 20종과 기존 글 별칭이 언어마다 새 상태에서 같은 HTML이 된다(SQL 빼고)', async () => {
    const names = [...CODE_LANGUAGES.map((item) => item.value), 'js', 'ts', 'py', 'sh', 'shell', 'objc'].filter(
      (name) => name !== 'sql',
    );
    const browser = createSiteHighlighter();
    const differ: string[] = [];
    for (const name of names) {
      const sample = SAMPLES[name] ?? SAMPLES[grammarForLanguage(name) ?? ''] ?? 'if (a) { return 1; }';
      const markdown = fence(name, sample);
      if ((await serverHtml(markdown)) !== markdownToHtml(markdown, { highlighter: browser })) differ.push(name);
    }
    expect(differ).toEqual([]);
  }, 30_000);

  it('서버는 SQL 함수 이름을 칠한다', async () => {
    const html = await serverHtml("```sql\nSELECT COUNT(*) FROM b WHERE c = 'd';\n```");
    // 함수 색(#0550AE·#79C0FF). 앞 공백은 같은 칸에 붙는다
    expect(html).toMatch(/<span style="--shiki-light:#0550AE;--shiki-dark:#79C0FF">\s*COUNT<\/span>/);
  });
});
