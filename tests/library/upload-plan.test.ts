// 서가 화면 올리기 계획 테스트 (서가 1단계 T6, Plan J8·J15)
import { describe, expect, it } from 'vitest';
import { analyzeJob, planDrop, textSourcesFor, type PickedFile, type UploadJob } from '@/library/ui/upload-plan';

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
    expect(job).toMatchObject({ format: 'html', relativePath: 'mood', fileName: 'mood.html' });
    expect(pathsOf(job)).toEqual(['index.html', 'app.js', 'style.css', 'shots/a.png', 'scene.html']);
  });

  it('꼴 b: index.html이 없으면 뿌리에 하나뿐인 html이 진입 파일이다', () => {
    const [job] = jobsOf(files('v1.2-notes/report.html', 'v1.2-notes/img/a.png'));
    expect(job.fileName).toBe('v1.2-notes.html');
    expect(pathsOf(job)).toEqual(['index.html', 'img/a.png']);
  });

  it('꼴 b: 진입 파일을 정할 수 없으면 거부한다', () => {
    expect(planDrop(files('x/a.html', 'x/b.html'))).toMatchObject({ ok: false, error: 'NO_ENTRY_IN_FOLDER' });
    expect(planDrop(files('x/a.png'))).toMatchObject({ ok: false, error: 'NO_ENTRY_IN_FOLDER' });
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
      ['html', 'doc', 'doc.html'],
      ['md', 'doc', 'doc.md'],
    ]);
  });

  it('md 하나 + 그림: md 작업이 그림을 모두 갖는다', () => {
    const [job] = jobsOf(files('note.md', 'img/a.png'));
    expect(job.format).toBe('md');
    expect(pathsOf(job)).toEqual(['index.md', 'img/a.png']);
    expect(job.pool).toEqual([]);
  });

  it('자산 없는 문서 여러 개는 문서마다 작업 하나', () => {
    const jobs = jobsOf(files('a.md', 'b.html', 'c.md', 'c.html'));
    expect(jobs.map((job) => [job.format, job.relativePath])).toEqual([
      ['md', 'a.md'],
      ['html', 'b.html'],
      ['html', 'c.html'],
      ['md', 'c.html'],
    ]);
  });

  it('여러 문서와 자산이 섞이면 거부한다', () => {
    expect(planDrop(files('a.html', 'b.html', 'img/x.png'))).toMatchObject({ ok: false, error: 'MIXED' });
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
    expect(job.relativePath).toBe('mood');
    expect(pathsOf(job)).toEqual(['index.html', 'a.png']);
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
