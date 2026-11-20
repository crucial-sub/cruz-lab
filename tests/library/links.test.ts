// md 사이 링크 풀이 테스트 (서가 2단계 T3, Plan J30~J33)
// - .md·.html 링크: 이 문서 키의 폴더를 기준으로 푼 대상 키 → docIdForKey → /admin/library/d/{id}.
//   .html이면 ?v=html. 원래 링크 글(ref)과 앞 문서(from)를 붙인다(J31 "서가에 없는 문서" 화면이 읽는다). #조각은 둔다.
// - 그 밖의 파일: 이 판에 있으면 문서 출처 주소, 없으면 /admin/library/missing 안내 화면(J32).
// - 바깥 주소(http:·mailto:·//…)와 #조각만인 링크는 그대로 둔다(null).
// - 데이터를 읽지 않는다. 맥 입구 문서는 맥 문서끼리, 서가 화면 문서는 같은 프로젝트끼리 이어진다(J33).
import { describe, expect, it } from 'vitest';
import { libraryLinkUrl, linkTargetKey, readLinkNotice } from '@/library/links';
import { docIdForKey } from '@/library/ticket';

const FROM = 'aaaaaaaaaaaaaaaaaaaa';
const MAC_KEY = 'mac:~/projects/p/docs/a';
const files = new Set(['index.md', 'img/a.png', 'data/표.csv']);
const fileUrl = (path: string) => `https://raw.example/d/${FROM}/${path.split('/').map(encodeURIComponent).join('/')}`;
const rewrite = libraryLinkUrl({ key: MAC_KEY, docId: FROM, files, fileUrl });

// 대상 키의 서가 문서 주소 (링크 글과 앞 문서를 붙인다)
const docLink = (key: string, ref: string, extra = '') =>
  `/admin/library/d/${docIdForKey(key)}?${extra}ref=${encodeURIComponent(ref)}&from=${FROM}`;
const missing = (ref: string) => `/admin/library/missing?from=${FROM}&ref=${encodeURIComponent(ref)}`;

describe('linkTargetKey: 이 문서 키의 폴더 기준으로 대상 문서 키를 푼다', () => {
  it('같은 폴더, 아래 폴더, 위 폴더', () => {
    expect(linkTargetKey(MAC_KEY, './b.md')).toBe('mac:~/projects/p/docs/b');
    expect(linkTargetKey(MAC_KEY, 'sub/c.md')).toBe('mac:~/projects/p/docs/sub/c');
    expect(linkTargetKey(MAC_KEY, '../x/c.md')).toBe('mac:~/projects/p/x/c');
  });

  it('확장자는 대소문자 없이 뗀다. 주소 인코딩을 풀고 NFC로 맞춘다', () => {
    expect(linkTargetKey(MAC_KEY, 'B.MD')).toBe('mac:~/projects/p/docs/B');
    expect(linkTargetKey(MAC_KEY, '%EC%84%9C%EA%B0%80.html')).toBe('mac:~/projects/p/docs/서가');
    expect(linkTargetKey(MAC_KEY, '서가.md'.normalize('NFD'))).toBe('mac:~/projects/p/docs/서가');
  });

  it('쿼리와 #조각은 키에 넣지 않는다', () => {
    expect(linkTargetKey(MAC_KEY, 'b.md?x=1#top')).toBe('mac:~/projects/p/docs/b');
  });

  it('홈(~) 위로 나가거나 절대 경로면 null', () => {
    expect(linkTargetKey(MAC_KEY, '../../../../x.md')).toBeNull();
    expect(linkTargetKey(MAC_KEY, '/Users/me/x.md')).toBeNull();
  });

  it('서가 화면 키: 같은 프로젝트 안에서만 푼다', () => {
    expect(linkTargetKey('web:proj/a', 'b.md')).toBe('web:proj/b');
    expect(linkTargetKey('web:proj/a', 'notes/c.html')).toBe('web:proj/notes/c');
    expect(linkTargetKey('web:proj/a', '../other/b.md')).toBeNull();
  });

  it('.md·.html 이 아닌 링크와 모르는 키는 null', () => {
    expect(linkTargetKey(MAC_KEY, 'img/a.png')).toBeNull();
    expect(linkTargetKey('x:y/a', 'b.md')).toBeNull();
  });
});

describe('libraryLinkUrl: md 링크 → 서가 주소', () => {
  it('md 링크는 대상 문서의 서가 주소로 간다', () => {
    expect(rewrite('./b.md')).toBe(docLink('mac:~/projects/p/docs/b', './b.md'));
    expect(rewrite('../x/c.md')).toBe(docLink('mac:~/projects/p/x/c', '../x/c.md'));
  });

  it('html 링크는 ?v=html을 붙인다(짝 문서에서 그림을 연다)', () => {
    expect(rewrite('b.html')).toBe(docLink('mac:~/projects/p/docs/b', 'b.html', 'v=html&'));
  });

  it('#조각은 끝에 둔다', () => {
    expect(rewrite('b.md#설계-결정')).toBe(`${docLink('mac:~/projects/p/docs/b', 'b.md#설계-결정')}#설계-결정`);
  });

  it('홈 위로 나가는 문서 링크와 절대 경로는 안내 화면으로 보낸다', () => {
    expect(rewrite('../../../../x.md')).toBe(missing('../../../../x.md'));
    expect(rewrite('/abs/x.md')).toBe(missing('/abs/x.md'));
  });

  it('판 안의 파일은 문서 출처 주소로, 판에 없는 파일은 안내 화면으로 보낸다', () => {
    expect(rewrite('./img/a.png')).toBe(fileUrl('img/a.png'));
    expect(rewrite('data/%ED%91%9C.csv')).toBe(fileUrl('data/표.csv'));
    expect(rewrite('data/none.csv')).toBe(missing('data/none.csv'));
    expect(rewrite('../outside.txt')).toBe(missing('../outside.txt'));
  });

  it('바깥 주소, #조각만인 링크, 빈 주소는 그대로 둔다', () => {
    for (const href of ['https://example.com/a.md', 'http://x', 'mailto:me@example.com', '//cdn.example/a', '#top', '', '?q=1']) {
      expect(rewrite(href)).toBeNull();
    }
  });

  it('서가 화면 문서는 같은 프로젝트의 서가 화면 문서로 간다(J33)', () => {
    const web = libraryLinkUrl({ key: 'web:proj/a', docId: FROM, files, fileUrl });
    expect(web('b.md')).toBe(docLink('web:proj/b', 'b.md'));
  });

  it('문서 주소를 만드는 함수를 바꿀 수 있다(공유 화면 PR-C)', () => {
    const shared = libraryLinkUrl({ key: MAC_KEY, docId: FROM, files, fileUrl, docPath: (id) => `/s/SHARE/d/${id}` });
    expect(shared('b.md')).toBe(
      `/s/SHARE/d/${docIdForKey('mac:~/projects/p/docs/b')}?ref=${encodeURIComponent('b.md')}&from=${FROM}`,
    );
  });

  // 서가 2단계 T9(J48): 공유 md 화면은 같은 공유 주소 아래로 잇는다. 관리자 주소(/admin)와 앞 문서 id를 싣지 않는다
  it('공유 화면: 문서 링크는 {공유 주소}/d/{id}, 없는 파일은 {공유 주소}/missing', () => {
    const shared = libraryLinkUrl({ key: MAC_KEY, docId: FROM, files, fileUrl, shareBase: '/s/SHARE' });
    expect(shared('b.md')).toBe(`/s/SHARE/d/${docIdForKey('mac:~/projects/p/docs/b')}`);
    expect(shared('../x/c.html#h')).toBe(`/s/SHARE/d/${docIdForKey('mac:~/projects/p/x/c')}?v=html#h`);
    expect(shared('/abs.md')).toBe('/s/SHARE/missing');
    expect(shared('nope.csv')).toBe('/s/SHARE/missing');
    expect(shared('img/a.png')).toBe(fileUrl('img/a.png'));
    expect(shared('https://example.com')).toBeNull();
    for (const href of ['b.md', '/abs.md', 'nope.csv']) expect(shared(href)).not.toContain('/admin');
  });
});

// J31·J32 안내 화면이 주소에서 링크 글과 앞 문서를 읽는다
describe('readLinkNotice', () => {
  it('ref와 from(문서 id 꼴만)을 읽는다', () => {
    const params = new URLSearchParams({ ref: '../b.md', from: FROM });
    expect(readLinkNotice(params)).toEqual({ ref: '../b.md', from: FROM });
  });

  it('from이 문서 id 꼴이 아니면 버린다(다른 주소로 가는 링크를 만들지 않는다)', () => {
    expect(readLinkNotice(new URLSearchParams({ ref: 'b.md', from: '../../admin' }))).toEqual({ ref: 'b.md', from: null });
  });

  it('없거나 빈 값은 null, 긴 링크 글은 300자로 자른다', () => {
    expect(readLinkNotice(new URLSearchParams())).toEqual({ ref: null, from: null });
    expect(readLinkNotice(new URLSearchParams({ ref: '  ' })).ref).toBeNull();
    expect(readLinkNotice(new URLSearchParams({ ref: 'x'.repeat(500) })).ref).toHaveLength(300);
  });
});
