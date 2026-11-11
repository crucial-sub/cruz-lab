// 열기 판정(D5)과 변경 판정(D1 b) 테스트
import { describe, expect, it } from 'vitest';
import { markdownToDoc } from '@/editor/markdown';
import {
  buildEditorJson,
  containsBlobUrl,
  editorJsonForSave,
  fitsFirestoreDepth,
  isEditorJsonV1,
  isSameMeta,
  resolveOpenDoc,
  sha256Hex,
  validateDraftForSave,
  type DraftMeta,
} from '@/editor/state/change';

const meta: DraftMeta = {
  title: '제목',
  description: '설명',
  slug: 'slug',
  category: 'react',
  tags: ['a', 'b'],
  series: { key: 'k', order: 1 },
  cover: { kind: 'generated' },
};

describe('sha256Hex', () => {
  it('소문자 16진수 64자다', async () => {
    const hash = await sha256Hex('abc');
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('resolveOpenDoc', () => {
  const markdown = '# 제목\n\n본문';

  it('editorJson의 해시가 지금 마크다운과 같으면 JSON 문서를 연다', async () => {
    const original = markdownToDoc(markdown).doc;
    const editorJson = await buildEditorJson(original, markdown);
    expect(isEditorJsonV1(editorJson)).toBe(true);
    const opened = await resolveOpenDoc({ markdown, editorJson });
    expect(opened.source).toBe('json');
    expect(opened.doc).toEqual(original);
    expect(opened.warnings).toEqual([]);
  });

  it('해시가 다르면(밖에서 마크다운을 고침) 마크다운을 파싱한다', async () => {
    const stale = await buildEditorJson(markdownToDoc('# 옛 제목').doc, '# 옛 제목');
    const opened = await resolveOpenDoc({ markdown, editorJson: stale });
    expect(opened.source).toBe('markdown');
    expect(opened.doc.content?.[0]?.type).toBe('heading');
  });

  it('editorJson이 없거나(기존 55편) 형식이 다르면 마크다운을 파싱한다', async () => {
    expect((await resolveOpenDoc({ markdown, editorJson: null })).source).toBe('markdown');
    expect((await resolveOpenDoc({ markdown, editorJson: { v: 2, doc: {} } })).source).toBe(
      'markdown',
    );
  });

  it('마크다운을 파싱할 때 지원하지 않는 HTML은 경고로 돌려준다', async () => {
    const opened = await resolveOpenDoc({
      markdown: '<iframe src="x"></iframe>',
      editorJson: null,
    });
    expect(opened.warnings.length).toBeGreaterThan(0);
  });
});

describe('isSameMeta', () => {
  it('같은 값이면 참이다', () => {
    expect(isSameMeta(meta, { ...meta, tags: ['a', 'b'] })).toBe(true);
  });

  it('태그 순서, 표지, 연재가 다르면 거짓이다', () => {
    expect(isSameMeta(meta, { ...meta, tags: ['b', 'a'] })).toBe(false);
    expect(isSameMeta(meta, { ...meta, cover: { kind: 'image', url: 'u', assetId: null } })).toBe(
      false,
    );
    expect(isSameMeta(meta, { ...meta, series: null })).toBe(false);
    expect(isSameMeta(meta, { ...meta, title: '제목 ' })).toBe(false);
  });
});

// ───────────── 리뷰 6.2 지적 1·2·8 ─────────────

describe('editorJsonForSave (리뷰 지적 1: Firestore 깊이 20 한도)', () => {
  it('얕은 문서는 v1 editorJson을 만든다', async () => {
    const markdown = '- a\n  - **b**';
    const result = await editorJsonForSave(markdownToDoc(markdown).doc, markdown);
    expect(isEditorJsonV1(result)).toBe(true);
  });

  it('3단 중첩 목록 + 굵게처럼 Firestore 깊이 한도를 넘으면 null이다(마크다운에서 다시 연다)', async () => {
    for (const markdown of ['- a\n  - b\n    - **c**', '- a\n  - b\n    - [c](https://x.com)']) {
      const doc = markdownToDoc(markdown).doc;
      expect(await editorJsonForSave(doc, markdown)).toBeNull();
    }
  });

  it('깊이 계산: draft.editorJson부터 센 경로 길이가 21을 넘으면 한도를 넘는다', () => {
    expect(fitsFirestoreDepth({ a: 1 }, 2)).toBe(true);
    let deep: unknown = 'leaf';
    for (let level = 0; level < 19; level += 1) deep = { x: deep };
    // 경로: draft(1) editorJson(2) + x 19개 = 21 → 통과
    expect(fitsFirestoreDepth(deep, 2)).toBe(true);
    expect(fitsFirestoreDepth({ x: deep }, 2)).toBe(false);
  });
});

describe('containsBlobUrl (리뷰 지적 2: blob 주소 저장 금지)', () => {
  it('blob:http(s):// 주소가 있으면 참이다', () => {
    expect(containsBlobUrl('![a](blob:http://localhost:4322/1b2c)')).toBe(true);
    expect(containsBlobUrl('<img src="blob:https://x.dev/abc">')).toBe(true);
  });

  it('보통 글의 "blob:" 낱말이나 일반 주소는 거짓이다', () => {
    expect(containsBlobUrl('Blob: 이진 큰 객체')).toBe(false);
    expect(containsBlobUrl('![a](https://firebasestorage.googleapis.com/x.webp)')).toBe(false);
  });
});

describe('validateDraftForSave (리뷰 지적 8: 서버가 400을 낼 메타는 보내지 않는다)', () => {
  const draft = { ...meta, markdown: '본문', editorJson: null };

  it('서버 스키마에 맞으면 ok', () => {
    expect(validateDraftForSave(draft)).toEqual({ ok: true });
  });

  it('연재 key 형식, 빈 표지 주소, 태그 4개는 칸별 이유를 돌려준다', () => {
    const result = validateDraftForSave({
      ...draft,
      series: { key: 'Bad Key', order: 1 },
      cover: { kind: 'image', url: '', assetId: null },
      tags: ['a', 'b', 'c', 'd'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.issues).sort()).toEqual(['cover', 'series', 'tags']);
  });
});
