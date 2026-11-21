// 맥 입구 공용 목록·내리기 모듈 (서가 1단계 T9, Plan J16·J19 "서가 문서" 명령)
// - listDocs: GET /api/library/token/docs → 서가 문서 요약 목록 (최근 올린 것부터, 서버 순서 그대로)
// - removeDoc: DELETE /api/library/token/docs/{id} → 204
// - 네트워크는 가짜 fetch로 서버 계약을 흉내 낸다. 오류는 올리기와 같은 PushError로 올린다.

import { describe, expect, it } from 'vitest';
import { listDocs, removeDoc, type LibraryDocItem } from '@/library/client/docs';
import { PushError } from '@/library/client/push';

interface Recorded {
  method: string;
  url: string;
  headers: Record<string, string>;
}

// 정해진 응답 하나를 주고 요청을 기록하는 가짜 fetch
function fakeFetch(response: () => Response) {
  const requests: Recorded[] = [];
  const fetchFn = async (input: string | URL | Request, init: RequestInit = {}) => {
    requests.push({
      method: init.method ?? 'GET',
      url: String(input),
      headers: Object.fromEntries(new Headers(init.headers).entries()),
    });
    return response();
  };
  return { requests, fetch: fetchFn as typeof fetch };
}

const DOC: LibraryDocItem = {
  id: 'abc123def456abc123de',
  title: '노트',
  project: 'cruz-lab',
  docDate: '2026-11-18',
  formats: { md: { rev: 2, entry: 'index.md', bytes: 120, fileCount: 2 } },
  unread: true,
  readAt: null,
  uploadedAt: '2026-11-18T01:00:00.000Z',
  updatedAt: '2026-11-18T02:00:00.000Z',
  url: 'http://localhost:4341/admin/library/d/abc123def456abc123de',
};

describe('listDocs', () => {
  it('서가 토큰을 붙여 목록을 받고, 서버 순서 그대로 돌려준다', async () => {
    const second = { ...DOC, id: 'zzz123def456abc123de', title: '두 번째', unread: false };
    const server = fakeFetch(() => Response.json({ docs: [DOC, second] }));

    const docs = await listDocs({ server: 'http://localhost:4341/', token: 'secret-token', fetch: server.fetch });

    expect(docs.map((doc) => doc.title)).toEqual(['노트', '두 번째']);
    expect(server.requests).toEqual([
      {
        method: 'GET',
        url: 'http://localhost:4341/api/library/token/docs',
        headers: { authorization: 'Bearer secret-token' },
      },
    ]);
  });

  it('서버 오류 응답의 code와 message를 PushError로 올린다', async () => {
    const server = fakeFetch(() =>
      Response.json({ error: { code: 'UNAUTHENTICATED', message: '서가 토큰이 틀렸습니다.' } }, { status: 401 }),
    );

    const error = await listDocs({ server: 'http://localhost:4341', token: 'bad', fetch: server.fetch }).catch((e) => e);

    expect(error).toBeInstanceOf(PushError);
    expect(error).toMatchObject({ code: 'UNAUTHENTICATED', status: 401, message: '서가 토큰이 틀렸습니다.' });
  });

  it('응답에 목록이 없으면 BAD_RESPONSE로 멈춘다', async () => {
    const server = fakeFetch(() => Response.json({ items: [] }));

    const error = await listDocs({ server: 'http://localhost:4341', token: 't', fetch: server.fetch }).catch((e) => e);

    expect(error).toMatchObject({ code: 'BAD_RESPONSE' });
  });
});

describe('removeDoc', () => {
  it('서가 토큰을 붙여 DELETE를 보내고, 204면 끝난다', async () => {
    const server = fakeFetch(() => new Response(null, { status: 204 }));

    await removeDoc({ server: 'http://localhost:4341', token: 'secret-token', fetch: server.fetch }, DOC.id);

    expect(server.requests).toEqual([
      {
        method: 'DELETE',
        url: `http://localhost:4341/api/library/token/docs/${DOC.id}`,
        // Content-Type이 없으면 운영의 Astro 출처 검사(checkOrigin)가 앱에 닿기 전에 403을 준다
        headers: { authorization: 'Bearer secret-token', 'content-type': 'application/json' },
      },
    ]);
  });

  it('문서 id를 주소 조각으로 감싼다', async () => {
    const server = fakeFetch(() => new Response(null, { status: 204 }));

    await removeDoc({ server: 'http://localhost:4341', token: 't', fetch: server.fetch }, 'a/../b');

    expect(server.requests[0].url).toBe('http://localhost:4341/api/library/token/docs/a%2F..%2Fb');
  });

  it('없는 문서의 404를 PushError로 올린다', async () => {
    const server = fakeFetch(() => Response.json({ error: { code: 'NOT_FOUND', message: '서가 문서가 없습니다.' } }, { status: 404 }));

    const error = await removeDoc({ server: 'http://localhost:4341', token: 't', fetch: server.fetch }, DOC.id).catch((e) => e);

    expect(error).toBeInstanceOf(PushError);
    expect(error).toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
