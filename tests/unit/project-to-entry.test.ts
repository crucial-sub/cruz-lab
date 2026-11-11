// 프로젝트 글 이전 변환 테스트 (재건 4단계 D1)
import { describe, expect, it } from 'vitest';
import { entryDocSchema, seriesMetaSchema } from '@/lib/entry-schema';
import {
  ProjectSourceError,
  collectInternalLinks,
  collectProjectImageRefs,
  decideProjectSync,
  findProjectSourceCollisions,
  parseFrontmatter,
  parseProjectMetaFile,
  parseProjectPostFile,
  planProjectRollback,
  projectEntryId,
  projectPostToEntry,
  projectSourceHash,
  rewriteProjectImages,
} from '@/lib/migrate/project-to-entry';

// 옛 project.md 모양 (cruz-lab에서 줄였다)
const META = `---
entryType: "project"
title: "Cruz Lab"
description: "Astro 5 + React 19 기반의 블로그 겸 포트폴리오 사이트"
longDescription: "브라우저에서 글을 쓰는 CMS를 붙인 사이트다."
image: "../../../assets/img/projects/cruz-lab/cruz-lab.png"
tags:
  - "Portfolio"
  - "Astro"
tech:
  - "Astro 5"
  - "TypeScript"
github: "https://github.com/crucial-sub/cruz-lab"
featured: true
order: 2
startDate: 2025-12
endDate: 2025-12
---
`;

// 옛 프로젝트 글 모양 (작은따옴표, 이미지, 코드 블록, 내부 링크)
const POST = `---
entryType: "post"
title: 'Cruz Lab 문서를 에이전트가 읽게 만들기'
description: 'MCP 서버로 감싼 이야기. ''따옴표''도 있다'
project: 'cruz-lab'
order: 3
chapterLabel: 'Part 3'
status: 'published'
---

앞 글은 [MCP 글](/blog/why-everyone-talks-about-mcp)이다.

![mcp-inspector-tools](../../../assets/img/projects/cruz-lab/mcp-inspector-tools.png)

\`![코드 안](../../../assets/img/projects/cruz-lab/nope.png)\`

\`\`\`md
![펜스 안](../../../assets/img/projects/cruz-lab/nope.png)
\`\`\`

끝 줄
`;

describe('parseFrontmatter', () => {
  it('문자열·수·참거짓·목록·YYYY-MM을 읽고 본문을 돌려준다', () => {
    const { data, body } = parseFrontmatter(META);
    expect(data).toMatchObject({
      entryType: 'project',
      title: 'Cruz Lab',
      tags: ['Portfolio', 'Astro'],
      featured: true,
      order: 2,
      startDate: '2025-12',
    });
    expect(body).toBe('');
  });

  it('작은따옴표 안의 두 작은따옴표는 하나다', () => {
    const { data } = parseFrontmatter(POST);
    expect(data.description).toBe("MCP 서버로 감싼 이야기. '따옴표'도 있다");
  });

  it('받지 않는 모양(인라인 목록, 여러 줄 문자열, 중첩)은 오류다', () => {
    expect(() => parseFrontmatter('---\ntags: [a, b]\n---\n')).toThrow(ProjectSourceError);
    expect(() => parseFrontmatter('---\ntext: |\n  a\n---\n')).toThrow(ProjectSourceError);
    expect(() => parseFrontmatter('---\na:\n  b: 1\n---\n')).toThrow(ProjectSourceError);
    expect(() => parseFrontmatter('본문만')).toThrow(ProjectSourceError);
    expect(() => parseFrontmatter('---\na: 1\na: 2\n---\n')).toThrow(ProjectSourceError);
  });
});

describe('parseProjectMetaFile', () => {
  it('project.md → seriesMeta 값(project 칸). 표지 경로는 따로 돌려준다', () => {
    const info = parseProjectMetaFile(META, 'cruz-lab');
    expect(info).toMatchObject({
      key: 'cruz-lab',
      title: 'Cruz Lab',
      coverImage: '../../../assets/img/projects/cruz-lab/cruz-lab.png',
      project: {
        tags: ['Portfolio', 'Astro'],
        tech: ['Astro 5', 'TypeScript'],
        github: 'https://github.com/crucial-sub/cruz-lab',
        featured: true,
        order: 2,
        startDate: '2025-12',
        endDate: '2025-12',
      },
    });
    expect(info.project).not.toHaveProperty('demo');
    expect(
      seriesMetaSchema.safeParse({
        title: info.title,
        description: info.description,
        project: info.project,
      }).success,
    ).toBe(true);
  });

  it('모르는 키, entryType 다름, 잘못된 월은 오류다', () => {
    expect(() =>
      parseProjectMetaFile(META.replace('order: 2', 'order: 2\nextra: "x"'), 'cruz-lab'),
    ).toThrow(/모르는 키/);
    expect(() => parseProjectMetaFile(META.replace('"project"', '"post"'), 'cruz-lab')).toThrow(
      /entryType/,
    );
    expect(() =>
      parseProjectMetaFile(META.replace('startDate: 2025-12', 'startDate: 2025-13'), 'cruz-lab'),
    ).toThrow(/YYYY-MM/);
    expect(() => parseProjectMetaFile(META, 'Cruz Lab')).toThrow(/연재 key/);
  });
});

describe('parseProjectPostFile', () => {
  it('글 값과 본문(앞 빈 줄 없음, 끝 줄바꿈 하나)을 돌려준다', () => {
    const post = parseProjectPostFile(POST, 'cruz-lab', 'cruz-lab-knowledge-mcp');
    expect(post).toMatchObject({
      key: 'cruz-lab',
      slug: 'cruz-lab-knowledge-mcp',
      title: 'Cruz Lab 문서를 에이전트가 읽게 만들기',
      order: 3,
      status: 'published',
    });
    expect(post.markdown.startsWith('앞 글은')).toBe(true);
    expect(post.markdown.endsWith('끝 줄\n')).toBe(true);
  });

  it('chapterLabel이 "Part <order>"가 아니면 오류다(새 문서에 칸이 없다)', () => {
    expect(() =>
      parseProjectPostFile(POST.replace("'Part 3'", "'에필로그'"), 'cruz-lab', 'x'),
    ).toThrow(/chapterLabel/);
  });

  it('project가 폴더와 다르거나 파일 이름이 slug 형식이 아니면 오류다', () => {
    expect(() => parseProjectPostFile(POST, 'stock-lab', 'x')).toThrow(/폴더 이름/);
    expect(() => parseProjectPostFile(POST, 'cruz-lab', 'Bad_Name')).toThrow(/slug/);
  });
});

describe('본문 이미지', () => {
  it('코드 밖의 프로젝트 이미지 상대 경로만 찾는다', () => {
    const post = parseProjectPostFile(POST, 'cruz-lab', 'cruz-lab-knowledge-mcp');
    expect(collectProjectImageRefs(post.markdown)).toEqual([
      {
        alt: 'mcp-inspector-tools',
        src: '../../../assets/img/projects/cruz-lab/mcp-inspector-tools.png',
        repoPath: 'src/assets/img/projects/cruz-lab/mcp-inspector-tools.png',
      },
    ]);
  });

  it('주소를 바꾸고 코드 안은 그대로 둔다. 주소의 &는 이스케이프하지 않는다(D14)', () => {
    const post = parseProjectPostFile(POST, 'cruz-lab', 'cruz-lab-knowledge-mcp');
    const url =
      'https://firebasestorage.googleapis.com/v0/b/b/o/assets%2Fa1%2Fmax.webp?alt=media&token=t';
    const next = rewriteProjectImages(
      post.markdown,
      new Map([['src/assets/img/projects/cruz-lab/mcp-inspector-tools.png', url]]),
    );
    expect(next).toContain(`![mcp-inspector-tools](${url})`);
    expect(next).toContain('`![코드 안](../../../assets/img/projects/cruz-lab/nope.png)`');
    expect(next).toContain('![펜스 안](../../../assets/img/projects/cruz-lab/nope.png)\n```');
    expect(next.length - post.markdown.length).toBe(
      url.length - '../../../assets/img/projects/cruz-lab/mcp-inspector-tools.png'.length,
    );
  });

  it('새 주소가 없는 이미지, 옮길 수 없는 상대 경로는 오류다', () => {
    expect(() =>
      rewriteProjectImages('![a](../../../assets/img/projects/x/a.png)', new Map()),
    ).toThrow(/새 주소/);
    expect(() => collectProjectImageRefs('![a](./a.png)')).toThrow(/상대 경로/);
    expect(() =>
      collectProjectImageRefs('![a](../../../assets/img/projects/../secret.png)'),
    ).toThrow(/올바르지/);
  });

  it('외부 주소와 사이트 경로 이미지는 건너뛴다', () => {
    expect(collectProjectImageRefs('![a](https://example.com/a.png) ![b](/a.png)')).toEqual([]);
  });

  it('내부 링크를 모은다(이미지는 빼고)', () => {
    expect(collectInternalLinks(POST)).toEqual(['/blog/why-everyone-talks-about-mcp']);
  });
});

describe('projectPostToEntry', () => {
  const post = parseProjectPostFile(POST, 'cruz-lab', 'cruz-lab-knowledge-mcp');
  const ctx = {
    sourcePath: 'src/content/projects/cruz-lab/cruz-lab-knowledge-mcp.md',
    sourceHash: 'a'.repeat(64),
    markdown: post.markdown,
    publishedAt: new Date('2026-03-01T00:00:00Z'),
    lastPublishedAt: new Date('2026-04-01T00:00:00Z'),
    now: new Date('2026-11-10T00:00:00Z'),
  };

  it('kind project, 연재 = { 프로젝트 key, Part }, 카테고리·태그 없음, 코드 커버. 스키마를 지킨다', () => {
    const entry = projectPostToEntry(post, ctx);
    expect(entry).toMatchObject({
      kind: 'project',
      status: 'published',
      publishedAt: ctx.publishedAt,
      lastPublishedAt: ctx.lastPublishedAt,
      legacy: null,
      draft: {
        version: 1,
        category: null,
        tags: [],
        series: { key: 'cruz-lab', order: 3 },
        cover: { kind: 'generated' },
      },
      published: { revision: 1, fromDraftVersion: 1, slug: 'cruz-lab-knowledge-mcp' },
      projectSource: {
        syncedDraftVersion: 1,
        syncedRevision: 1,
        syncedStatus: 'published',
        sourceHash: 'a'.repeat(64),
      },
    });
    expect(entryDocSchema.safeParse(entry).success).toBe(true);
  });

  it('갱신이면 번호를 올리고 처음 만든 시각과 첫 발행 시각은 그대로다', () => {
    const entry = projectPostToEntry(post, {
      ...ctx,
      previous: {
        draftVersion: 1,
        revision: 1,
        createdAt: ctx.publishedAt,
        publishedAt: ctx.publishedAt,
      },
    });
    expect(entry).toMatchObject({
      createdAt: ctx.publishedAt,
      publishedAt: ctx.publishedAt,
      lastPublishedAt: ctx.now,
      draft: { version: 2 },
      published: { revision: 2, fromDraftVersion: 2 },
      projectSource: { syncedDraftVersion: 2, syncedRevision: 2 },
    });
  });

  it('문서 ID는 project-<key>-<slug>로 고정이다', () => {
    expect(projectEntryId('cruz-lab', 'cruz-lab-knowledge-mcp')).toBe(
      'project-cruz-lab-cruz-lab-knowledge-mcp',
    );
  });
});

describe('projectSourceHash', () => {
  it('본문이나 이미지가 바뀌면 바뀌고, 이미지 순서에는 상관없다', () => {
    const a = { repoPath: 'a.png', sha256: '1' };
    const b = { repoPath: 'b.png', sha256: '2' };
    const base = projectSourceHash('본문', [a, b]);
    expect(projectSourceHash('본문', [b, a])).toBe(base);
    expect(projectSourceHash('본문!', [a, b])).not.toBe(base);
    expect(projectSourceHash('본문', [a, { ...b, sha256: '3' }])).not.toBe(base);
  });
});

describe('decideProjectSync', () => {
  const synced = {
    sourceHash: 'h1',
    syncedDraftVersion: 1,
    syncedRevision: 1,
    syncedStatus: 'published' as const,
  };
  const entry = {
    status: 'published' as const,
    draftVersion: 1,
    revision: 1,
    projectSource: synced,
  };

  it('없으면 만든다. 에디터로 지운 글은 되살리지 않는다', () => {
    expect(decideProjectSync({ sourceHash: 'h1', entry: null, deletedInRebuild: false })).toBe(
      'create',
    );
    expect(decideProjectSync({ sourceHash: 'h1', entry: null, deletedInRebuild: true })).toBe(
      'skip-deleted-in-rebuild',
    );
  });

  it('원본이 같으면 건너뛴다(에디터로 고쳤어도)', () => {
    expect(decideProjectSync({ sourceHash: 'h1', entry, deletedInRebuild: false })).toBe('skip');
    expect(
      decideProjectSync({
        sourceHash: 'h1',
        entry: { ...entry, draftVersion: 5 },
        deletedInRebuild: false,
      }),
    ).toBe('skip');
  });

  it('원본이 바뀌었으면 갱신. 에디터로도 고쳤으면(초안 버전·발행 번호·상태) 충돌', () => {
    expect(decideProjectSync({ sourceHash: 'h2', entry, deletedInRebuild: false })).toBe('update');
    expect(
      decideProjectSync({
        sourceHash: 'h2',
        entry: { ...entry, draftVersion: 2 },
        deletedInRebuild: false,
      }),
    ).toBe('conflict');
    expect(
      decideProjectSync({
        sourceHash: 'h2',
        entry: { ...entry, revision: 2 },
        deletedInRebuild: false,
      }),
    ).toBe('conflict');
    expect(
      decideProjectSync({
        sourceHash: 'h2',
        entry: { ...entry, status: 'hidden' },
        deletedInRebuild: false,
      }),
    ).toBe('conflict');
  });

  it('같은 ID인데 이전 표지가 없으면 충돌', () => {
    expect(
      decideProjectSync({
        sourceHash: 'h1',
        entry: { ...entry, projectSource: null },
        deletedInRebuild: false,
      }),
    ).toBe('conflict');
  });
});

describe('findProjectSourceCollisions', () => {
  it('문서 ID와 slug 겹침을 찾는다', () => {
    expect(
      findProjectSourceCollisions([
        { key: 'a', slug: 'b-c', file: 'a/b-c.md' },
        { key: 'a-b', slug: 'c', file: 'a-b/c.md' },
      ]),
    ).toEqual(['문서 ID가 겹친다(project-a-b-c): a/b-c.md, a-b/c.md']);
    expect(
      findProjectSourceCollisions([
        { key: 'x', slug: 'part-1', file: 'x/part-1.md' },
        { key: 'y', slug: 'part-1', file: 'y/part-1.md' },
      ]),
    ).toEqual(['slug가 겹친다(part-1): x/part-1.md, y/part-1.md']);
    expect(findProjectSourceCollisions([{ key: 'x', slug: 'a', file: 'x/a.md' }])).toEqual([]);
  });
});

describe('planProjectRollback', () => {
  const synced = { syncedDraftVersion: 1, syncedRevision: 1, syncedStatus: 'published' as const };
  const entry = (id: string, overrides = {}) => ({
    id,
    status: 'published' as const,
    draftVersion: 1,
    revision: 1,
    seriesKeys: ['cruz-lab'],
    projectSource: synced,
    ...overrides,
  });
  const base = {
    entries: [
      entry('p1'),
      entry('p2'),
      { ...entry('post1'), seriesKeys: ['pintos'], projectSource: null },
    ],
    assets: [
      { id: 'up1', legacy: false, usedBy: ['p1'] }, // 이전이 올린 자산
      { id: 'later', legacy: false, usedBy: ['p2'] }, // 이전 뒤 에디터로 올린 자산(기록에 없음)
      { id: 'shared', legacy: false, usedBy: ['p1', 'post1'] }, // 다른 글도 쓴다
    ],
    seriesMetaWithProject: ['cruz-lab'],
    manifest: { uploadedAssetIds: ['up1', 'shared'], createdSeriesMeta: ['cruz-lab'] },
    includeEdited: false,
  };

  it('기록에 있는 새 자산만 지운다. 그 밖은 usedBy만 고친다. 새로 만든 seriesMeta는 문서째 지운다', () => {
    const plan = planProjectRollback(base);
    expect(plan.entries.sort()).toEqual(['p1', 'p2']);
    expect(plan.deleteAssets).toEqual(['up1']);
    expect(plan.updateAssets).toEqual([
      { id: 'later', usedBy: [] },
      { id: 'shared', usedBy: ['post1'] },
    ]);
    expect(plan.deleteSeriesMeta).toEqual(['cruz-lab']);
  });

  it('기록이 없으면 자산·seriesMeta 문서를 지우지 않는다(칸만 지운다)', () => {
    const plan = planProjectRollback({ ...base, manifest: null });
    expect(plan.deleteAssets).toEqual([]);
    expect(plan.deleteSeriesMeta).toEqual([]);
    expect(plan.clearProjectField).toEqual(['cruz-lab']);
  });

  it('에디터로 고친 글은 빼고 알린다. 그 글이 쓰는 자산과 프로젝트는 남긴다', () => {
    const plan = planProjectRollback({
      ...base,
      entries: [entry('p1', { draftVersion: 3 }), entry('p2')],
    });
    expect(plan.editedEntries).toEqual(['p1']);
    expect(plan.entries).toEqual(['p2']);
    expect(plan.deleteAssets).toEqual([]);
    expect(plan.deleteSeriesMeta).toEqual([]);
    expect(plan.clearProjectField).toEqual([]);
    const forced = planProjectRollback({
      ...base,
      entries: [entry('p1', { draftVersion: 3 }), entry('p2')],
      includeEdited: true,
    });
    expect(forced.entries.sort()).toEqual(['p1', 'p2']);
    expect(forced.deleteAssets).toEqual(['up1']);
  });
});
