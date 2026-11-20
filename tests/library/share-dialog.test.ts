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
