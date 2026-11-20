// 공유 창 보조 함수 테스트 (서가 2단계 T9, Plan J51)
// - "공유" 단추의 data-* 값 → 공유 대상, 고른 범위·기간 → POST 본문. DOM 없이 시험한다.
import { describe, expect, it } from 'vitest';
import { shareRequestBody, shareTargetFrom } from '@/library/ui/share-dialog';

describe('shareTargetFrom: "공유" 단추의 data-* 값', () => {
  it('문서 하나: 문서 id와 제목', () => {
    expect(shareTargetFrom({ shareKind: 'doc', shareDoc: 'aaaaaaaaaaaaaaaaaaaa', shareTitle: '질문 1' })).toEqual({
      kind: 'doc',
      docId: 'aaaaaaaaaaaaaaaaaaaa',
      title: '질문 1',
    });
  });

  it('프로젝트: 이름과 고를 수 있는 폴더 (JSON 글)', () => {
    expect(
      shareTargetFrom({ shareKind: 'project', shareProject: 'interview-lab', shareFolders: '["bundles","bundles/a"]' }),
    ).toEqual({ kind: 'project', project: 'interview-lab', folders: ['bundles', 'bundles/a'], title: 'interview-lab' });
  });

  it('폴더 글이 깨졌거나 글자가 아닌 값은 버린다', () => {
    expect(shareTargetFrom({ shareKind: 'project', shareProject: 'p', shareFolders: '{' })).toMatchObject({ folders: [] });
    expect(shareTargetFrom({ shareKind: 'project', shareProject: 'p', shareFolders: '[1,"a"]' })).toMatchObject({ folders: ['a'] });
  });

  it('값이 빠졌거나 모르는 종류면 null', () => {
    expect(shareTargetFrom({ shareKind: 'doc' })).toBeNull();
    expect(shareTargetFrom({ shareKind: 'project' })).toBeNull();
    expect(shareTargetFrom({ shareKind: 'all' })).toBeNull();
    expect(shareTargetFrom({})).toBeNull();
  });
});

describe('shareRequestBody: POST /api/admin/library/shares 본문', () => {
  it('문서 하나', () => {
    expect(shareRequestBody({ kind: 'doc', docId: 'aaaaaaaaaaaaaaaaaaaa', title: 't' }, '', '7d')).toEqual({
      scope: { kind: 'doc', docId: 'aaaaaaaaaaaaaaaaaaaa' },
      duration: '7d',
    });
  });

  it('프로젝트 전체(폴더 고르기 빈 값)와 폴더', () => {
    const target = { kind: 'project' as const, project: 'p', folders: ['a'], title: 'p' };
    expect(shareRequestBody(target, '', 'forever')).toEqual({ scope: { kind: 'project', project: 'p' }, duration: 'forever' });
    expect(shareRequestBody(target, 'a', '1d')).toEqual({ scope: { kind: 'folder', project: 'p', folder: 'a' }, duration: '1d' });
  });

  it('모르는 기간은 기본(7일)', () => {
    expect(shareRequestBody({ kind: 'doc', docId: 'aaaaaaaaaaaaaaaaaaaa', title: 't' }, '', '2d').duration).toBe('7d');
  });
});

// 미리보기 확인에서 찾은 결함(2026-11-20): hidden 속성과 Tailwind 표시 클래스(flex 등)를 한 요소에 두면
// 클래스가 이겨서 숨지 않는다. 그래서 문서 하나 공유에도 "범위" 칸이 보였고, 결과 뒤에도 입력 칸이 남았다.
// 스크립트가 hidden으로 켜고 끄는 요소에는 표시 클래스를 두지 않는다(안쪽 요소에 둔다).
describe('ShareDialog.astro: 켜고 끄는 칸에 표시 클래스가 없다', () => {
  it('data-share-form·result·scope-row·error 요소의 class에 flex·grid·block이 없다', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL('../../src/library/ui/ShareDialog.astro', import.meta.url), 'utf8');
    for (const name of ['data-share-form', 'data-share-result', 'data-share-scope-row', 'data-share-error']) {
      const tag = source.match(new RegExp(`<[a-z]+[^>]*\\b${name}\\b[^>]*>`))?.[0];
      expect(tag, name).toBeDefined();
      const classes = tag?.match(/class="([^"]*)"/)?.[1] ?? '';
      expect(classes, name).not.toMatch(/(^|\s)(flex|inline-flex|grid|block|inline-block|table)(\s|$)/);
    }
  });
});
