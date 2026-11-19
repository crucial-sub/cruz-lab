// 서가 검색 순수 함수 테스트 (서가 2단계 T2, Plan J26·J27·7.1)
// - 색인 글자 뽑기: md는 앞머리와 문법 기호를 덜고, html은 script·style·태그·data: 주소를 지운다. 형식마다 200 KB.
// - 찾기: 부분 문자열(NFC, 대소문자 무시), 띄어 쓴 낱말은 모두 들어간 문서만, 제목에 맞은 문서가 먼저.
// - 결과의 제목·글 조각은 HTML 이스케이프한 뒤 맞은 낱말을 <mark>로 감싼다.
import { describe, expect, it } from 'vitest';
import {
  SEARCH_TEXT_MAX_BYTES,
  highlightHtml,
  htmlSearchText,
  markdownSearchText,
  searchDocs,
  searchTerms,
  searchTextOf,
  truncateUtf8,
} from '@/library/search';

describe('markdownSearchText: md 문법 기호를 던다', () => {
  it('앞머리, 제목 #, 강조, 링크 주소, 그림 주소, 목록·인용 기호를 지운다', () => {
    const md = [
      '---',
      'title: 숨은 앞머리',
      '---',
      '# 서가 **검색** 설계',
      '',
      '> 인용한 _문장_',
      '',
      '- 첫째 [링크 글](https://example.com/a.md)',
      '1. 둘째 ![그림 설명](img/a.png)',
      '',
      '[정의]: https://example.com/def',
    ].join('\n');
    const text = markdownSearchText(md);
    expect(text).toBe('서가 검색 설계 인용한 문장 첫째 링크 글 둘째 그림 설명');
  });

  it('코드 펜스 줄은 지우고 코드 내용은 남긴다. 줄 안 코드의 백틱도 던다', () => {
    const md = '본문 `LIBRARY_ENABLED` 값\n\n```ts\nconst 서가 = 1;\n```\n끝';
    expect(markdownSearchText(md)).toBe('본문 LIBRARY_ENABLED 값 const 서가 = 1; 끝');
  });

  it('표의 세로줄과 구분 줄을 지운다', () => {
    const md = '| 이름 | 값 |\n| --- | :---: |\n| 서가 | 켬 |';
    expect(markdownSearchText(md)).toBe('이름 값 서가 켬');
  });

  it('md 안 HTML 태그를 지우고 개체를 푼다. 줄 안 태그는 낱말을 끊지 않는다', () => {
    expect(markdownSearchText('<p>한<b>글</b> &amp; 영어&nbsp;글</p>')).toBe('한글 & 영어 글');
  });

  it('data: 주소를 지운다', () => {
    expect(markdownSearchText('앞 data:image/png;base64,iVBORw0KGgo 뒤')).toBe('앞 뒤');
  });
});

describe('htmlSearchText: html에서 읽을 글만 남긴다', () => {
  it('script·style·주석·head를 지우고 태그를 지운다', () => {
    const html = [
      '<!doctype html><html><head><title>제목</title><style>.a{color:red}</style></head>',
      '<body><!-- 숨은 주석 --><h1>서가</h1><p>본문 <em>강조</em>입니다</p>',
      '<script>const 비밀 = "보이면 안 됨";</script></body></html>',
    ].join('');
    expect(htmlSearchText(html)).toBe('서가 본문 강조입니다');
  });

  it('블록 태그 사이는 띄우고, 줄 안 태그(span·b 등)는 낱말을 끊지 않는다', () => {
    expect(htmlSearchText('<p>첫 문단</p><p>둘째</p><div>서<span>가</span></div>')).toBe('첫 문단 둘째 서가');
  });

  it('속성 안의 > 와 data: 주소에 속지 않는다', () => {
    const html = '<img alt="a > b" src="data:image/png;base64,AAAA"><p>글 data:text/plain,xyz 끝</p>';
    expect(htmlSearchText(html)).toBe('글 끝');
  });

  it('HTML 개체를 푼다(이름·10진·16진)', () => {
    expect(htmlSearchText('<p>&lt;서가&gt; &#54620;&#xAE00; &quot;끝&quot;</p>')).toBe('<서가> 한글 "끝"');
  });
});

describe('truncateUtf8·searchTextOf: 형식마다 200 KB', () => {
  it('UTF-8 바이트로 자르고 글자 중간에서 끊지 않는다', () => {
    // 한글 한 글자는 3바이트다
    expect(truncateUtf8('가나다', 7)).toBe('가나');
    expect(truncateUtf8('가나다', 9)).toBe('가나다');
    expect(truncateUtf8('ab😀', 5)).toBe('ab');
  });

  it('뽑은 글이 200 KB를 넘으면 자른다', () => {
    const text = searchTextOf('md', '가'.repeat(100_000));
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(SEARCH_TEXT_MAX_BYTES);
    expect(text.length).toBe(Math.floor(SEARCH_TEXT_MAX_BYTES / 3));
  });

  it('NFD 글을 NFC로 맞춘다(macOS 파일 이름·글)', () => {
    expect(searchTextOf('md', '서가'.normalize('NFD'))).toBe('서가');
  });
});

describe('searchTerms', () => {
  it('띄어 쓴 낱말로 나누고, 같은 낱말은 한 번만, NFC로 맞춘다', () => {
    expect(searchTerms('  서가   검색 서가 ')).toEqual(['서가', '검색']);
    expect(searchTerms('Library LIBRARY')).toEqual(['Library']);
    expect(searchTerms('서가'.normalize('NFD'))).toEqual(['서가']);
    expect(searchTerms('   ')).toEqual([]);
  });

  it('낱말은 8개까지만 쓴다', () => {
    expect(searchTerms('a b c d e f g h i j')).toHaveLength(8);
  });
});

describe('searchDocs: 찾기·순위', () => {
  const docs = [
    { id: 'd1', title: '배포 기록', md: '운영 서가를 켰다. 문서 출처는 raw 주소다.' },
    { id: 'd2', title: '서가 설계', md: '검색은 부분 문자열로 찾는다.' },
    { id: 'd3', title: '맥주 따르기', html: '잔을 기울여 거품을 만든다. Library 이름은 서가다.' },
  ];

  it('본문에만 있는 한국어 낱말을 부분 문자열로 찾는다', () => {
    expect(searchDocs(docs, '출처').map((hit) => hit.id)).toEqual(['d1']);
    // "기울여"의 일부
    expect(searchDocs(docs, '기울').map((hit) => hit.id)).toEqual(['d3']);
  });

  it('대소문자를 무시한다', () => {
    expect(searchDocs(docs, 'library').map((hit) => hit.id)).toEqual(['d3']);
  });

  it('띄어 쓴 낱말은 모두 들어간 문서만 낸다(낱말마다 제목·본문 어디든)', () => {
    expect(searchDocs(docs, '서가 거품').map((hit) => hit.id)).toEqual(['d3']);
    expect(searchDocs(docs, '서가 없는낱말')).toEqual([]);
  });

  it('제목에 맞은 문서가 먼저다. 나머지는 들어온 순서(최근 문서 먼저)다', () => {
    expect(searchDocs(docs, '서가').map((hit) => hit.id)).toEqual(['d2', 'd1', 'd3']);
  });

  it('빈 검색어는 결과가 없다', () => {
    expect(searchDocs(docs, '  ')).toEqual([]);
  });

  it('결과 수를 제한한다', () => {
    const many = Array.from({ length: 80 }, (_, index) => ({ id: `m${index}`, title: `문서 ${index}`, md: '같은 낱말' }));
    expect(searchDocs(many, '낱말')).toHaveLength(50);
    expect(searchDocs(many, '낱말', { limit: 3 })).toHaveLength(3);
  });

  it('글 조각은 맞은 낱말의 앞뒤를 보이고, 잘린 쪽에 …를 붙인다', () => {
    const long = `${'앞'.repeat(100)} 목표낱말 ${'뒤'.repeat(200)}`;
    const [hit] = searchDocs([{ id: 'x', title: '제목', md: long }], '목표낱말');
    expect(hit.snippetHtml).toMatch(/^…앞+ <mark>목표낱말<\/mark> 뒤+…$/);
  });

  it('본문에 맞은 낱말이 없으면(제목에만 맞으면) 본문 앞부분을 보인다', () => {
    const [hit] = searchDocs([{ id: 'x', title: '서가 설계', md: '첫 문장입니다.' }], '설계');
    expect(hit.titleHtml).toBe('서가 <mark>설계</mark>');
    expect(hit.snippetHtml).toBe('첫 문장입니다.');
  });

  it('제목·글 조각의 HTML을 이스케이프한다', () => {
    const [hit] = searchDocs([{ id: 'x', title: '<b>제목</b>', md: '<script>alert(1)</script> 낱말 & 끝' }], '낱말');
    expect(hit.titleHtml).toBe('&lt;b&gt;제목&lt;/b&gt;');
    expect(hit.snippetHtml).toBe('&lt;script&gt;alert(1)&lt;/script&gt; <mark>낱말</mark> &amp; 끝');
  });
});

describe('highlightHtml', () => {
  it('맞은 낱말을 모두 감싸고, 긴 낱말을 먼저 맞춘다', () => {
    expect(highlightHtml('서가 서가검색', ['서가', '서가검색'])).toBe('<mark>서가</mark> <mark>서가검색</mark>');
  });

  it('정규식 특수 문자를 글자로 맞춘다', () => {
    expect(highlightHtml('a.b axb', ['a.b'])).toBe('<mark>a.b</mark> axb');
  });

  it('대소문자를 무시하고 원래 글자를 남긴다', () => {
    expect(highlightHtml('Library', ['library'])).toBe('<mark>Library</mark>');
  });
});
