// 서가 화면 올리기 계획 테스트 (서가 1단계 T6, Plan J8·J15)
import { describe, expect, it } from 'vitest';
import { identifyUpload, validateManifest } from '@/library/rules';
import {
  analyzeJob,
  collectionWarnings,
  describeFolderEntryError,
  entryDroppedFiles,
  exceedsFolderLimit,
  planCollection,
  planDrop,
  planEntry,
  textSourcesFor,
  type CollectionPlan,
  type DropChoice,
  type PickedFile,
  type UploadJob,
} from '@/library/ui/upload-plan';

const files = (...paths: string[]): PickedFile[] => paths.map((path) => ({ path, bytes: 10 }));

// 성공한 계획의 작업들 (실패면 테스트를 깨뜨린다)
function jobsOf(picked: PickedFile[]): UploadJob[] {
  const plan = planDrop(picked);
  if (!plan.ok) throw new Error(`계획 실패: ${plan.error}`);
  return plan.jobs;
}

const pathsOf = (job: UploadJob) => job.files.map((file) => file.path);

describe('planDrop: 놓은 파일을 문서별 작업으로', () => {
  it('html 하나: 진입 파일을 index.html로 바꾼다. 키는 원래 파일 이름', () => {
    const [job] = jobsOf(files('2026-11-16-plan.html'));
    expect(job).toMatchObject({ format: 'html', relativePath: '2026-11-16-plan.html', fileName: '2026-11-16-plan.html' });
    expect(job.files).toEqual([{ source: '2026-11-16-plan.html', path: 'index.html', bytes: 10 }]);
  });

  it('꼴 a: html 하나 + 옆 폴더. 자산 경로는 그대로 둔다', () => {
    const [job] = jobsOf(files('audit.html', 'audit-assets/1.png', 'audit-assets/2.png'));
    expect(job.format).toBe('html');
    expect(pathsOf(job)).toEqual(['index.html', 'audit-assets/1.png', 'audit-assets/2.png']);
  });

  it('꼴 b: 폴더 하나. 폴더 이름을 떼고, 폴더 이름이 키가 된다', () => {
    const [job] = jobsOf(files('mood/index.html', 'mood/app.js', 'mood/style.css', 'mood/shots/a.png', 'mood/scene.html'));
    expect(job).toMatchObject({ format: 'html', relativePath: 'mood.html', fileName: 'mood.html' });
    expect(pathsOf(job)).toEqual(['index.html', 'app.js', 'style.css', 'shots/a.png', 'scene.html']);
  });

  // PR #36 리뷰(CodeRabbit I6): 서버는 relativePath 끝의 .md·.html을 떼고 같은 문서 키를 만든다(J8).
  // 폴더 작업이 폴더 이름만 보내면, 이름이 .md·.html로 끝나는 폴더가 다른 문서와 같은 키가 되어 앞 판을 갈아치운다.
  it('꼴 b: 폴더 작업의 키는 폴더 이름 + 형식 확장자. 이름이 .md·.html로 끝나는 폴더도 다른 문서와 겹치지 않는다', () => {
    const keyOf = (job: UploadJob) =>
      identifyUpload({ kind: 'web', project: 'p', relativePath: job.relativePath, fileName: job.fileName })?.key;
    const [plain] = jobsOf(files('notes/index.html'));
    const [dottedMd] = jobsOf(files('notes.md/index.html'));
    const [dottedHtml] = jobsOf(files('notes.html/index.html'));
    const [file] = jobsOf(files('notes.html'));
    // 폴더 notes와 파일 notes.html은 같은 문서다(J8, 바뀌지 않음)
    expect(keyOf(plain)).toBe(keyOf(file));
    expect(new Set([keyOf(plain), keyOf(dottedMd), keyOf(dottedHtml)]).size).toBe(3);
  });

  it('꼴 b: index.html이 없으면 뿌리에 하나뿐인 html이 진입 파일이다', () => {
    const [job] = jobsOf(files('v1.2-notes/report.html', 'v1.2-notes/img/a.png'));
    expect(job.fileName).toBe('v1.2-notes.html');
    expect(pathsOf(job)).toEqual(['index.html', 'img/a.png']);
  });

  it('꼴 b: 폴더 뿌리에 문서가 없으면 거부하고 뿌리의 html·md 개수(0)를 함께 준다', () => {
    expect(planDrop(files('x/a.png'))).toMatchObject({ ok: false, error: 'NO_ENTRY_IN_FOLDER', rootDocs: { html: 0, md: 0 } });
    expect(planDrop(files('x/sub/a.html', 'x/a.png'))).toMatchObject({
      ok: false,
      error: 'NO_ENTRY_IN_FOLDER',
      rootDocs: { html: 0, md: 0 },
    });
  });

  it('꼴 b: html과 이름이 다른 md(README.md)는 자산이다', () => {
    const jobs = jobsOf(files('x/index.html', 'x/README.md'));
    expect(jobs).toHaveLength(1);
    expect(pathsOf(jobs[0])).toEqual(['index.html', 'README.md']);
  });

  it('짝: 같은 이름의 md와 html은 작업 두 개, 같은 키. md는 그림을 pool에서 고른다', () => {
    const jobs = jobsOf(files('plan.md', 'plan.html', 'plan-assets/a.png'));
    expect(jobs.map((job) => [job.format, job.relativePath, job.fileName])).toEqual([
      ['html', 'plan.html', 'plan.html'],
      ['md', 'plan.html', 'plan.md'],
    ]);
    expect(pathsOf(jobs[0])).toEqual(['index.html', 'plan-assets/a.png']);
    expect(pathsOf(jobs[1])).toEqual(['index.md']);
    expect(jobs[1].pool.map((file) => file.path)).toEqual(['plan-assets/a.png']);
  });

  it('폴더 안의 짝: index.html + index.md', () => {
    const jobs = jobsOf(files('doc/index.html', 'doc/index.md'));
    expect(jobs.map((job) => [job.format, job.relativePath, job.fileName])).toEqual([
      ['html', 'doc.html', 'doc.html'],
      ['md', 'doc.md', 'doc.md'],
    ]);
  });

  it('md 하나 + 그림: md 작업이 그림을 모두 갖는다', () => {
    const [job] = jobsOf(files('note.md', 'img/a.png'));
    expect(job.format).toBe('md');
    expect(pathsOf(job)).toEqual(['index.md', 'img/a.png']);
    expect(job.pool).toEqual([]);
  });

  it('폴더 2개 이상을 놓으면 거부한다 (J60)', () => {
    expect(planDrop(files('a/index.html', 'b/index.html'))).toMatchObject({ ok: false, error: 'MIXED' });
  });

  it('문서가 없으면 NO_DOC, 받을 파일이 없으면 EMPTY', () => {
    expect(planDrop(files('a.png', 'b.css'))).toMatchObject({ ok: false, error: 'NO_DOC' });
    expect(planDrop(files('.DS_Store'))).toMatchObject({ ok: false, error: 'EMPTY' });
    expect(planDrop([])).toMatchObject({ ok: false, error: 'EMPTY' });
  });

  it('숨은 파일·받지 않는 형식·받을 수 없는 이름은 거르고 알린다', () => {
    const plan = planDrop(files('mood/index.html', 'mood/.DS_Store', 'mood/.git/HEAD', 'mood/a.zip', 'mood/b%41.png'));
    expect(plan.ok).toBe(true);
    expect(plan.skipped).toEqual([
      { path: 'mood/.DS_Store', reason: 'hidden' },
      { path: 'mood/.git/HEAD', reason: 'hidden' },
      { path: 'mood/a.zip', reason: 'type' },
      { path: 'mood/b%41.png', reason: 'name' },
    ]);
  });

  it('macOS의 NFD 이름을 NFC로 맞춘다. source는 원래 값을 둔다', () => {
    const nfd = '그림.png'.normalize('NFD');
    const [job] = jobsOf(files('a.html', nfd));
    expect(job.files[1]).toEqual({ source: nfd, path: '그림.png', bytes: 10 });
  });

  it('끌어다 놓기 경로의 앞 / 를 뗀다', () => {
    const [job] = jobsOf(files('/mood/index.html', '/mood/a.png'));
    expect(job.relativePath).toBe('mood.html');
    expect(pathsOf(job)).toEqual(['index.html', 'a.png']);
  });
});

// 사용자가 골라야 하는 계획의 DropChoice (아니면 테스트를 깨뜨린다)
function choiceOf(picked: PickedFile[]): DropChoice {
  const plan = planDrop(picked);
  if (plan.ok || plan.error !== 'NEEDS_CHOICE') throw new Error(`NEEDS_CHOICE가 아닙니다: ${JSON.stringify(plan)}`);
  return plan.choice;
}

const docNames = (choice: DropChoice) => choice.docs.map((doc) => doc.name);

describe('planDrop: 폴더 판정 (J57~J59)', () => {
  it('뿌리에 index.html이 있으면 다른 문서가 있어도 문서 하나로 바로 올린다', () => {
    const jobs = jobsOf(files('site/index.html', 'site/about.html', 'site/notes.md', 'site/a.png'));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].relativePath).toBe('site.html');
    expect(pathsOf(jobs[0])).toEqual(['index.html', 'about.html', 'notes.md', 'a.png']);
  });

  it('html 하나 + README.md는 문서 하나다. README는 자산이다', () => {
    const jobs = jobsOf(files('camera/scene.html', 'camera/README.md', 'camera/shots/a.png'));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ format: 'html', relativePath: 'camera.html' });
    expect(pathsOf(jobs[0])).toEqual(['index.html', 'README.md', 'shots/a.png']);
  });

  it('md 하나 + README.md도 문서 하나다', () => {
    const jobs = jobsOf(files('x/note.md', 'x/README.md'));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].format).toBe('md');
    expect(pathsOf(jobs[0])).toEqual(['index.md', 'README.md']);
  });

  it('뿌리에 README만 있으면 그것이 진입 파일이다', () => {
    const jobs = jobsOf(files('x/README.md', 'x/img/a.png'));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ format: 'md', relativePath: 'x.md' });
    expect(pathsOf(jobs[0])).toEqual(['index.md', 'img/a.png']);
  });

  it('같은 이름의 md·html은 후보 하나다. 바로 올린다', () => {
    const jobs = jobsOf(files('x/plan.html', 'x/plan.md', 'x/img/a.png'));
    expect(jobs.map((job) => job.format)).toEqual(['html', 'md']);
  });

  it('x.html 옆의 x.src.html은 세지 않는다', () => {
    const jobs = jobsOf(files('x/plan.html', 'x/plan.src.html'));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].format).toBe('html');
  });

  it('html 여럿 + md 하나는 묻는다. md 문서 1편으로 만들지 않는다 (C19)', () => {
    const choice = choiceOf(files('x/a.html', 'x/b.html', 'x/c.html', 'x/README.md'));
    expect(docNames(choice)).toEqual(['README', 'a', 'b', 'c']);
    expect(choice.folder).toBe('x');
  });

  it('html 하나 + 이름이 다른 md 하나도 묻는다', () => {
    expect(docNames(choiceOf(files('x/a.html', 'x/b.md')))).toEqual(['a', 'b']);
  });

  it('index.md + 다른 md는 묻는다', () => {
    expect(docNames(choiceOf(files('x/index.md', 'x/a.md')))).toEqual(['a', 'index']);
  });

  it('md 여러 편은 묻는다', () => {
    expect(docNames(choiceOf(files('x/a.md', 'x/b.md', 'x/c.md')))).toEqual(['a', 'b', 'c']);
  });

  it('x.src.html을 문서에서 빼고 sourceCopies로 준다 (J59)', () => {
    const choice = choiceOf(files('v/a.html', 'v/a.src.html', 'v/b.html', 'v/b.src.html', 'v/README.md'));
    expect(docNames(choice)).toEqual(['README', 'a', 'b']);
    expect(choice.sourceCopies).toEqual(['a.src.html', 'b.src.html']);
  });

  it('짝이 없는 x.src.html은 보통 문서다', () => {
    expect(docNames(choiceOf(files('v/a.src.html', 'v/b.html')))).toEqual(['a.src', 'b']);
  });

  it('짝 문서는 한 항목이다. html·md 파일을 함께 갖는다', () => {
    const choice = choiceOf(files('x/a.html', 'x/a.md', 'x/b.md'));
    expect(docNames(choice)).toEqual(['a', 'b']);
    expect(choice.docs[0].html?.path).toBe('a.html');
    expect(choice.docs[0].md?.path).toBe('a.md');
    expect(choice.docs[1].html).toBeNull();
  });

  it('진입 파일 후보는 뿌리 문서마다 하나다(짝은 html). 경로는 폴더 이름을 뗀 값이다', () => {
    const choice = choiceOf(files('x/a.html', 'x/a.md', 'x/b.md', 'x/sub/c.html'));
    expect(choice.entryOptions).toEqual(['a.html', 'b.md']);
  });

  it('하위 폴더 문서는 수만 센다. node_modules 안은 세지 않는다 (L13, J66)', () => {
    const choice = choiceOf(
      files('x/a.md', 'x/b.md', 'x/sub/c.md', 'x/sub/deep/d.html', 'x/node_modules/pkg/README.md', 'x/sub/node_modules/q/e.html'),
    );
    expect(docNames(choice)).toEqual(['a', 'b']);
    expect(choice.subfolderDocs).toBe(2);
  });

  it('pool에는 폴더 이름을 뗀 모든 파일이 든다. source는 놓은 경로다', () => {
    const choice = choiceOf(files('x/a.md', 'x/b.md', 'x/img/p.png'));
    expect(choice.pool.map((file) => file.path)).toEqual(['a.md', 'b.md', 'img/p.png']);
    expect(choice.pool[2].source).toBe('x/img/p.png');
  });

  it('뿌리 문서는 없고 하위 폴더에만 있으면 거부한다', () => {
    expect(planDrop(files('mockups/a/index.html', 'mockups/b/index.html'))).toMatchObject({
      ok: false,
      error: 'NO_ENTRY_IN_FOLDER',
    });
  });
});

describe('planDrop: 뿌리에 놓은 파일 (J60)', () => {
  it('문서 파일 2편 이상은 묻는다. 진입 파일 후보는 없다', () => {
    const choice = choiceOf(files('a.md', 'b.html', 'c.md', 'c.html'));
    expect(choice.folder).toBeNull();
    expect(docNames(choice)).toEqual(['a', 'b', 'c']);
    expect(choice.entryOptions).toEqual([]);
  });

  it('문서 여러 편 + 자산은 MIXED가 아니다. 하위 경로 파일은 자산 후보다', () => {
    const choice = choiceOf(files('a.html', 'b.html', 'img/x.png'));
    expect(docNames(choice)).toEqual(['a', 'b']);
    expect(choice.pool.map((file) => file.path)).toContain('img/x.png');
  });

  it('고른 README.md도 문서 한 편으로 센다', () => {
    expect(docNames(choiceOf(files('a.html', 'README.md')))).toEqual(['README', 'a']);
  });

  it('문서 하나 + 자산은 지금처럼 바로 올린다', () => {
    const jobs = jobsOf(files('a.md', 'img/x.png'));
    expect(jobs).toHaveLength(1);
    expect(pathsOf(jobs[0])).toEqual(['index.md', 'img/x.png']);
  });
});

describe('textSourcesFor·analyzeJob: 빠진 자산', () => {
  it('html 작업: 진입 파일과 css·html을 읽는다', () => {
    const [job] = jobsOf(files('mood/index.html', 'mood/css/a.css', 'mood/scene.html', 'mood/x.png'));
    expect(textSourcesFor(job)).toEqual(['mood/index.html', 'mood/css/a.css', 'mood/scene.html']);
  });

  it('html·css·다른 html이 가리키는데 없는 자산을 찾는다. 문서 밖 주소도 알린다', () => {
    const [job] = jobsOf(files('mood/index.html', 'mood/css/a.css', 'mood/scene.html', 'mood/shots/1.png'));
    const texts: Record<string, string> = {
      'mood/index.html': '<link rel="stylesheet" href="css/a.css"><img src="shots/1.png"><img src="shots/2.png"><a href="scene.html">장면</a>',
      'mood/css/a.css': 'body{background:url(../img/bg.png)}',
      'mood/scene.html': '<img src="shots/3.png"><script src="../../lib.js"></script>',
    };
    const result = analyzeJob(job, (source) => texts[source]);
    expect(result.missing).toEqual(['img/bg.png', 'shots/2.png', 'shots/3.png']);
    expect(result.outside).toEqual(['../../lib.js']);
  });

  it('md 짝: 가리키는 그림만 pool에서 골라 넣고, 없는 그림을 알린다', () => {
    const jobs = jobsOf(files('plan.md', 'plan.html', 'img/a.png', 'img/b.png'));
    const md = jobs[1];
    const result = analyzeJob(md, () => '# 계획\n\n![a](img/a.png)\n![c](img/c.png)\n[다른 글](other.md)');
    expect(pathsOf(result.job)).toEqual(['index.md', 'img/a.png']);
    expect(result.job.pool).toEqual([]);
    expect(result.missing).toEqual(['img/c.png']);
  });

  it('빠진 것이 없으면 빈 목록', () => {
    const [job] = jobsOf(files('a.html', 'a-assets/1.png'));
    const result = analyzeJob(job, () => '<img src="a-assets/1.png">');
    expect(result.missing).toEqual([]);
    expect(result.outside).toEqual([]);
  });
});

// ---------- 진입 파일 오류 글 ----------

describe('describeFolderEntryError: 폴더 뿌리의 문서 개수로 막힌 이유와 할 일을 알린다', () => {
  it('폴더 뿌리에 문서가 없다', () => {
    expect(describeFolderEntryError({ html: 0, md: 0 })).toBe(
      '진입 파일을 정할 수 없습니다. 폴더 뿌리에 md·html 문서가 없습니다. ' +
        '문서가 하위 폴더에 있으면 그 폴더를 올립니다.',
    );
  });
});

// ---------- 문서 모음 계획 (폴더 2차 Plan J61·J63·J64·J66·J70) ----------

// 글 내용을 가진 놓은 파일 묶음
function tree(contents: Record<string, string | number>) {
  const picked: PickedFile[] = Object.entries(contents).map(([path, value]) => ({
    path,
    bytes: typeof value === 'number' ? value : value.length,
  }));
  const readText = async (source: string) => {
    const value = contents[source];
    return typeof value === 'string' ? value : undefined;
  };
  return { picked, readText };
}

async function collectionOf(contents: Record<string, string | number>, exclude?: Set<string>) {
  const { picked, readText } = tree(contents);
  return planCollection(choiceOf(picked), readText, exclude ? { exclude } : undefined);
}

const jobPaths = (plan: CollectionPlan, fileName: string) =>
  plan.jobs.find((job) => job.fileName === fileName)?.files.map((file) => file.path);

describe('planCollection: 문서마다 자기 자산', () => {
  it('문서는 자기가 가리키는 자산만 갖는다', async () => {
    const plan = await collectionOf({
      'x/a.html': '<img src="img/a.png">',
      'x/b.md': '# b\n\n![b](img/b.png)',
      'x/img/a.png': 'a',
      'x/img/b.png': 'b',
    });
    expect(jobPaths(plan, 'a.html')).toEqual(['index.html', 'img/a.png']);
    expect(jobPaths(plan, 'b.md')).toEqual(['index.md', 'img/b.png']);
  });

  it('css가 가리키는 자산까지 따라간다', async () => {
    const plan = await collectionOf({
      'x/a.html': '<link rel="stylesheet" href="css/a.css">',
      'x/b.html': '<p>b</p>',
      'x/css/a.css': 'body{background:url(../img/bg.png)}',
      'x/img/bg.png': 'p',
    });
    expect(jobPaths(plan, 'a.html')).toEqual(['index.html', 'css/a.css', 'img/bg.png']);
    expect(jobPaths(plan, 'b.html')).toEqual(['index.html']);
  });

  it('함께 쓰는 자산은 문서마다 넣고 sharedAssets로 알린다', async () => {
    const plan = await collectionOf({
      'x/a.html': '<img src="shared.png"><img src="only-a.png">',
      'x/b.html': '<img src="shared.png">',
      'x/shared.png': 's',
      'x/only-a.png': 'a',
    });
    expect(jobPaths(plan, 'a.html')).toContain('shared.png');
    expect(jobPaths(plan, 'b.html')).toContain('shared.png');
    expect(plan.sharedAssets).toEqual(['shared.png']);
    expect(plan.assets).toEqual(['only-a.png', 'shared.png']);
  });

  it('짝 문서의 html·md가 같은 자산을 써도 공용으로 세지 않는다', async () => {
    const plan = await collectionOf({
      'x/a.html': '<img src="p.png">',
      'x/a.md': '![p](p.png)',
      'x/b.md': '# b',
      'x/p.png': 'p',
    });
    expect(plan.sharedAssets).toEqual([]);
  });

  it('아무도 안 쓰는 파일은 올리지 않고 unusedFiles로 보인다', async () => {
    const plan = await collectionOf({
      'x/a.md': '# a',
      'x/b.md': '# b',
      'x/unused.png': 'u',
      'x/sub/notes.txt': 't',
    });
    expect(plan.unusedFiles).toEqual(['sub/notes.txt', 'unused.png']);
    expect(plan.jobs.flatMap((job) => job.files.map((file) => file.path))).not.toContain('unused.png');
  });

  it('하위 폴더 문서, x.src.html, node_modules는 unusedFiles에 넣지 않는다 (카드가 따로 센다)', async () => {
    const plan = await collectionOf({
      'x/a.html': '<p>a</p>',
      'x/a.src.html': '<p>src</p>',
      'x/b.md': '# b',
      'x/sub/c.md': '# c',
      'x/node_modules/pkg/index.js': 'x',
    });
    expect(plan.unusedFiles).toEqual([]);
  });

  it('문서가 가리키면 node_modules 파일도 자산이다 (파일로 올릴 때와 같다)', async () => {
    const plan = await collectionOf({
      'x/a.html': '<script src="node_modules/pkg/index.js"></script>',
      'x/b.md': '# b',
      'x/node_modules/pkg/index.js': 'x',
    });
    expect(jobPaths(plan, 'a.html')).toContain('node_modules/pkg/index.js');
  });

  it('없는 자산과 문서 밖 주소를 문서마다 알린다', async () => {
    const plan = await collectionOf({
      'x/a.html': '<img src="none.png"><img src="../up.png">',
      'x/b.md': '# b',
    });
    expect(plan.docs.find((doc) => doc.name === 'a')).toMatchObject({ missing: ['none.png'], outside: ['../up.png'] });
    expect(plan.docs.find((doc) => doc.name === 'b')).toMatchObject({ missing: [], outside: [] });
  });

  it('iframe이 가리키는 다른 html은 자산으로 들어가고 그 안의 자산도 따라간다', async () => {
    const plan = await collectionOf({
      'x/a.html': '<iframe src="b.html"></iframe>',
      'x/b.html': '<img src="p.png">',
      'x/p.png': 'p',
    });
    expect(jobPaths(plan, 'a.html')).toEqual(['index.html', 'b.html', 'p.png']);
  });
});

describe('planCollection: 키와 작업 순서 (J61·J64)', () => {
  it('폴더를 놓으면 relativePath는 {폴더}/{파일 이름}, fileName은 파일 이름이다', async () => {
    const plan = await collectionOf({ 'bundles/a.md': '# a', 'bundles/b.html': '<p>b</p>' });
    expect(plan.jobs.map((job) => [job.format, job.relativePath, job.fileName])).toEqual([
      ['md', 'bundles/a.md', 'a.md'],
      ['html', 'bundles/b.html', 'b.html'],
    ]);
  });

  it('파일을 놓으면 relativePath는 파일 이름이다', async () => {
    const plan = await collectionOf({ 'a.md': '# a', 'b.md': '# b' });
    expect(plan.jobs.map((job) => job.relativePath)).toEqual(['a.md', 'b.md']);
  });

  it('짝 문서는 html 작업을 먼저, md 작업을 나중에 둔다. 두 작업의 문서 키가 같다', async () => {
    const plan = await collectionOf({ 'x/a.html': '<p>a</p>', 'x/a.md': '# a', 'x/b.md': '# b' });
    expect(plan.jobs.map((job) => job.fileName)).toEqual(['a.html', 'a.md', 'b.md']);
    const keyOf = (job: UploadJob) =>
      identifyUpload({ kind: 'web', project: 'p', relativePath: job.relativePath, fileName: job.fileName })?.key;
    expect(keyOf(plan.jobs[0])).toBe('web:p/x/a');
    expect(keyOf(plan.jobs[1])).toBe('web:p/x/a');
  });

  it('작업의 files가 그대로 올릴 목록이다(pool 없음)', async () => {
    const plan = await collectionOf({ 'x/a.html': '<p>a</p>', 'x/a.md': '![p](p.png)', 'x/b.md': '# b', 'x/p.png': 'p' });
    expect(plan.jobs.every((job) => job.pool.length === 0)).toBe(true);
    expect(jobPaths(plan, 'a.md')).toEqual(['index.md', 'p.png']);
  });

  it('문서 요약에 형식, 파일 수, 바이트를 담는다. 짝은 두 작업의 합이다', async () => {
    const plan = await collectionOf({ 'x/a.html': '12345', 'x/a.md': '123', 'x/b.md': '12' });
    expect(plan.docs[0]).toMatchObject({ name: 'a', formats: ['html', 'md'], fileCount: 2, bytes: 8 });
    expect(plan.docs[1]).toMatchObject({ name: 'b', formats: ['md'], fileCount: 1, bytes: 2 });
  });
});

describe('planCollection: 끈 문서 (L15)', () => {
  it('끈 문서는 작업과 요약에서 빠진다', async () => {
    const plan = await collectionOf({ 'x/a.md': '# a', 'x/b.md': '# b', 'x/c.md': '# c' }, new Set(['b']));
    expect(plan.jobs.map((job) => job.fileName)).toEqual(['a.md', 'c.md']);
    expect(plan.docs.map((doc) => doc.name)).toEqual(['a', 'c']);
  });

  it('끈 문서만 쓰던 자산은 안 쓰는 파일이 된다. 끈 문서 자체는 넣지 않는다', async () => {
    const plan = await collectionOf(
      { 'x/a.md': '# a', 'x/b.md': '![p](p.png)', 'x/p.png': 'p' },
      new Set(['b']),
    );
    expect(plan.unusedFiles).toEqual(['p.png']);
  });

  it('끈 뒤 한 문서만 쓰는 자산은 공용이 아니다', async () => {
    const plan = await collectionOf(
      { 'x/a.md': '![p](p.png)', 'x/b.md': '![p](p.png)', 'x/p.png': 'p' },
      new Set(['b']),
    );
    expect(plan.sharedAssets).toEqual([]);
  });
});

describe('planCollection: 리뷰 수정', () => {
  it('끈 문서는 다른 문서의 자산으로도 올라가지 않는다. 빠진 파일로 알린다 (C1)', async () => {
    const plan = await collectionOf(
      { 'x/a.html': '<iframe src="secret.html"></iframe>', 'x/secret.html': '<p>s</p>', 'x/secret.md': '# s', 'x/b.md': '# b' },
      new Set(['secret']),
    );
    expect(jobPaths(plan, 'a.html')).toEqual(['index.html']);
    expect(plan.docs.find((doc) => doc.name === 'a')?.missing).toEqual(['secret.html']);
    expect(plan.jobs.flatMap((job) => job.files.map((file) => file.source))).not.toContain('x/secret.html');
  });

  it('받지 않는 형식의 참조를 경고한다 (I8)', async () => {
    const { picked, readText } = tree({ 'x/a.html': '<img src="p.heic">', 'x/b.md': '# b' });
    const choice = choiceOf(picked);
    const plan = await planCollection(choice, readText);
    expect(collectionWarnings(choice, plan).join('\n')).toContain('받지 않는 형식 1개: a: p.heic');
  });

  it('find를 주면 그 함수로 자산을 찾는다', async () => {
    const { picked, readText } = tree({ 'x/a.md': '![p](Img/P.png)', 'x/b.md': '# b', 'x/img/p.png': 'p' });
    const plan = await planCollection(choiceOf(picked), readText, {
      find: async (path) => (path === 'Img/P.png' ? { source: 'x/img/p.png', path, bytes: 1 } : null),
    });
    expect(jobPaths(plan, 'a.md')).toEqual(['index.md', 'Img/P.png']);
  });
});

describe('planDrop: 폰 사본 (I7)', () => {
  it('x.md 옆의 x.phone.md는 문서가 아니다', () => {
    const choice = choiceOf(files('x/a.md', 'x/a.phone.md', 'x/b.md'));
    expect(docNames(choice)).toEqual(['a', 'b']);
    expect(choice.sourceCopies).toEqual(['a.phone.md']);
    expect(choice.entryOptions).toEqual(['a.md', 'b.md']);
  });

  it('x.html 옆의 x.phone.md도 세지 않는다. 문서 1편이면 바로 올린다', () => {
    expect(jobsOf(files('x/scene.html', 'x/scene.phone.md'))).toHaveLength(1);
    expect(jobsOf(files('x/a.md', 'x/a.phone.md'))[0].format).toBe('md');
  });

  it('원본이 없는 x.phone.md는 보통 문서다', () => {
    expect(docNames(choiceOf(files('x/z.phone.md', 'x/b.md')))).toEqual(['b', 'z.phone']);
  });
});

describe('exceedsFolderLimit (I10)', () => {
  it('숨은 파일은 세지 않는다', () => {
    const paths = ['x/a.md', ...Array.from({ length: 2500 }, (_, i) => `x/.git/objects/${i}`)];
    expect(exceedsFolderLimit(paths)).toBe(false);
  });

  it('보이는 파일이 한도를 넘으면 true', () => {
    expect(exceedsFolderLimit(Array.from({ length: 2001 }, (_, i) => `x/p${i}.png`))).toBe(true);
    expect(exceedsFolderLimit(Array.from({ length: 2000 }, (_, i) => `x/p${i}.png`))).toBe(false);
  });
});

describe('planCollection: HTML 사이 링크 (J70)', () => {
  it('HTML 문서에서 모음 안의 다른 문서로 가는 링크를 모두 센다', async () => {
    const plan = await collectionOf({
      'x/a.html': '<a href="b.html">1</a><a href="b.html">2</a><a href="c.md">3</a>',
      'x/b.html': '<a href="a.html">4</a>',
      'x/c.md': '[md 링크는 세지 않는다](a.html)',
    });
    expect(plan.htmlDocLinks).toBe(4);
  });

  it('자기 파일로 가는 링크는 세지 않는다. 짝 md로 가는 링크는 열리지 않으므로 센다 (실측 184 = 151 + 33)', async () => {
    const plan = await collectionOf({
      'x/a.html': '<a href="a.html">1</a><a href="a.md">2</a><a href="b.md">3</a>',
      'x/a.md': '# a',
      'x/b.md': '# b',
    });
    expect(plan.htmlDocLinks).toBe(2);
  });

  it('끈 문서에서 나가는 링크는 세지 않고, 끈 문서로 가는 링크는 센다', async () => {
    const plan = await collectionOf(
      { 'x/a.html': '<a href="b.html">1</a>', 'x/b.html': '<a href="a.html">2</a>' },
      new Set(['b']),
    );
    expect(plan.htmlDocLinks).toBe(1);
  });
});

describe('planCollection: 한도 (J66)', () => {
  it('문서가 100편을 넘으면 limitError', async () => {
    const contents: Record<string, string> = {};
    for (let i = 0; i < 101; i += 1) contents[`x/d${String(i).padStart(3, '0')}.md`] = '# d';
    expect((await collectionOf(contents)).limitError).toBe('TOO_MANY_DOCS');
  });

  it('문서가 100편이면 통과한다', async () => {
    const contents: Record<string, string> = {};
    for (let i = 0; i < 100; i += 1) contents[`x/d${String(i).padStart(3, '0')}.md`] = '# d';
    expect((await collectionOf(contents)).limitError).toBeNull();
  });

  it('복사를 포함한 파일이 500개를 넘으면 limitError', async () => {
    // 문서 3편이 자산 167개를 함께 쓴다: (1 + 167) × 3 = 504
    const refs = Array.from({ length: 167 }, (_, i) => `<img src="p${i}.png">`).join('');
    const contents: Record<string, string> = { 'x/a.html': refs, 'x/b.html': refs, 'x/c.html': refs };
    for (let i = 0; i < 167; i += 1) contents[`x/p${i}.png`] = 'p';
    expect((await collectionOf(contents)).limitError).toBe('TOO_MANY_FILES');
  });

  it('복사를 포함한 합계가 200 MB를 넘으면 limitError', async () => {
    const plan = await collectionOf({
      'x/a.html': '<img src="big.png">',
      'x/b.html': '<img src="big.png">',
      'x/big.png': 101 * 1024 * 1024,
    });
    expect(plan.limitError).toBe('TOO_LARGE');
  });

  it('끈 문서는 한도에 들지 않는다', async () => {
    const plan = await collectionOf(
      { 'x/a.html': '<img src="big.png">', 'x/b.html': '<img src="big.png">', 'x/big.png': 101 * 1024 * 1024 },
      new Set(['b']),
    );
    expect(plan.limitError).toBeNull();
  });
});

describe('planCollection: 읽지 못한 문서', () => {
  it('글을 읽지 못한 문서(5 MB 초과)는 unreadDocs에 넣고 진입 파일만 올린다', async () => {
    const plan = await collectionOf({ 'x/big.html': 6 * 1024 * 1024, 'x/b.md': '# b' });
    expect(plan.unreadDocs).toEqual(['big']);
    expect(jobPaths(plan, 'big.html')).toEqual(['index.html']);
  });
});

// ---------- 진입 파일 고르기 (폴더 2차 Plan J67·J68) ----------

describe('planEntry: 문서 하나 + 고른 진입 파일', () => {
  it('키는 폴더 키다. 진입 파일은 index.html과 원래 이름 두 경로로 들어간다', () => {
    const choice = choiceOf(files('x/overview.html', 'x/b.html', 'x/img/a.png'));
    const [job] = planEntry(choice, 'overview.html');
    expect(job).toMatchObject({ format: 'html', relativePath: 'x.html', fileName: 'x.html' });
    expect(pathsOf(job)).toEqual(['index.html', 'overview.html', 'b.html', 'img/a.png']);
    expect(job.files[0].source).toBe('x/overview.html');
    expect(job.files[1].source).toBe('x/overview.html');
  });

  it('고른 파일로 만든 목록이 validateManifest를 통과한다', () => {
    const choice = choiceOf(files('x/overview.html', 'x/b.html'));
    const [job] = planEntry(choice, 'overview.html');
    const manifest = job.files.map((file) => ({ path: file.path, bytes: 1, sha256: 'a'.repeat(64) }));
    expect(validateManifest('html', manifest).ok).toBe(true);
  });

  it('같은 이름의 md가 있으면 짝으로 올린다. html 작업이 먼저다', () => {
    const choice = choiceOf(files('x/a.html', 'x/a.md', 'x/b.md', 'x/p.png'));
    const jobs = planEntry(choice, 'a.html');
    expect(jobs.map((job) => [job.format, job.relativePath])).toEqual([
      ['html', 'x.html'],
      ['md', 'x.md'],
    ]);
    expect(pathsOf(jobs[1])).toEqual(['index.md', 'a.md']);
    expect(jobs[1].pool.map((file) => file.path)).toEqual(['b.md', 'p.png']);
  });

  it('짝의 md 이름으로 골라도 같은 결과다', () => {
    const choice = choiceOf(files('x/a.html', 'x/a.md', 'x/b.md'));
    expect(planEntry(choice, 'a.md')).toEqual(planEntry(choice, 'a.html'));
  });

  it('md 진입 파일: index.md와 원래 이름 두 경로', () => {
    const choice = choiceOf(files('x/a.md', 'x/b.md', 'x/p.png'));
    const [job] = planEntry(choice, 'a.md');
    expect(job).toMatchObject({ format: 'md', relativePath: 'x.md' });
    expect(pathsOf(job)).toEqual(['index.md', 'a.md', 'b.md', 'p.png']);
  });

  it('index.md를 고르면 원래 이름 사본을 두지 않는다', () => {
    const choice = choiceOf(files('x/index.md', 'x/a.md'));
    const [job] = planEntry(choice, 'index.md');
    expect(pathsOf(job)).toEqual(['index.md', 'a.md']);
  });

  it('진입 경로와 겹치는 자산은 빼고 entryDroppedFiles로 알린다', () => {
    const choice = choiceOf(files('x/index.md', 'x/a.md'));
    const [job] = planEntry(choice, 'a.md');
    expect(pathsOf(job)).toEqual(['index.md', 'a.md']);
    expect(job.files[0].source).toBe('x/a.md');
    expect(entryDroppedFiles(choice, 'a.md')).toEqual(['index.md']);
    expect(entryDroppedFiles(choice, 'index.md')).toEqual([]);
  });

  it('뿌리 문서가 아닌 이름은 거부한다', () => {
    const choice = choiceOf(files('x/a.md', 'x/b.md', 'x/sub/c.html', 'x/p.png'));
    expect(() => planEntry(choice, 'sub/c.html')).toThrow();
    expect(() => planEntry(choice, 'p.png')).toThrow();
    expect(() => planEntry(choice, 'none.md')).toThrow();
  });

  it('x.src.html은 진입 파일이 되지 못한다', () => {
    const choice = choiceOf(files('x/a.html', 'x/a.src.html', 'x/b.html'));
    expect(choice.entryOptions).toEqual(['a.html', 'b.html']);
    expect(() => planEntry(choice, 'a.src.html')).toThrow();
  });

  it('파일을 놓은 경우(폴더 없음)는 거부한다', () => {
    const choice = choiceOf(files('a.md', 'b.md'));
    expect(() => planEntry(choice, 'a.md')).toThrow();
  });
});
