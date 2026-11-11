// 독자 화면 /admin/readers (재건 5단계 D20)
// - 날짜별 전체 방문(30·90일 막대), 수 칸(방문·페이지 조회·이력서 PDF·바깥 링크·코드 복사),
//   많이 읽힌 글(글 하나의 독자 화면 링크), 들어온 곳 상위, 블로그 안 검색어(0건 먼저), 없는 주소 상위.
// - "방문"은 탭 하나의 세션이다(D20 "몇 명"의 뜻). 화면 머리에 적는다.
// - 데이터는 날짜 요약 문서만이다(GET /api/admin/readers). 글 제목은 관리자 목록에서 찾는다.

import { useState } from 'react';
import { useAdmin } from '../app-context';
import { entryReadersPath } from '../router';
import { BarChart } from './BarChart';
import {
  CountRow,
  PeriodToggle,
  Section,
  Stat,
  useEntryTitles,
  useReaderData,
} from './ReaderParts';
import { countText, decodePath, readersApi, refLabel, type ReaderDays } from './readers-api';

export function ReadersScreen() {
  const [days, setDays] = useState<ReaderDays>(30);
  const state = useReaderData(() => readersApi.site(days), [days]);
  const titleOf = useEntryTitles();
  const { list } = useAdmin();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">독자</h1>
          <p className="mt-1 text-sm text-text-secondary">
            운영 주소(www.cruzlab.dev)의 방문만 셉니다. 방문은 탭 하나의 세션입니다. 관리자
            브라우저와 자동 브라우저는 세지 않습니다. 쿠키·IP·브라우저 정보는 저장하지 않습니다.
          </p>
        </div>
        <PeriodToggle days={days} onChange={setDays} />
      </div>

      {state.phase === 'loading' && (
        <p className="py-12 text-center text-sm text-text-secondary">독자 기록을 불러오는 중…</p>
      )}
      {state.phase === 'error' && (
        <p className="py-12 text-center text-sm text-text-secondary">
          독자 기록을 받지 못했습니다. {state.message}
        </p>
      )}
      {state.phase === 'ready' &&
        (() => {
          const { summary } = state.data;
          const { totals } = summary;
          return (
            <>
              <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Stat label="방문" value={countText(totals.visits)} />
                <Stat label="페이지 조회" value={countText(totals.views)} />
                <Stat label="이력서 PDF" value={countText(totals.pdf)} />
                <Stat label="바깥 링크" value={countText(totals.out)} />
                <Stat label="코드 복사" value={countText(totals.copy)} />
              </dl>

              <div className="mt-5 rounded-lg border border-border bg-bg-surface p-4">
                <BarChart
                  points={summary.daily.map((point) => ({ day: point.day, value: point.visits }))}
                  label="날짜별 방문"
                />
              </div>
              {totals.views === 0 && (
                <p className="mt-3 text-sm text-text-secondary">
                  이 기간에 기록이 없습니다. 운영 주소(www.cruzlab.dev)의 방문만 쌓입니다.
                </p>
              )}

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <Section
                  title="많이 읽힌 글"
                  note="그 글을 연 방문 수 순입니다."
                  empty={summary.entries.length === 0}
                >
                  <ul>
                    {summary.entries.map((item) => (
                      <CountRow
                        key={item.id}
                        count={`방문 ${countText(item.visits)} · 조회 ${countText(item.views)}`}
                      >
                        <a
                          href={entryReadersPath(item.id)}
                          className="text-text-primary hover:underline"
                        >
                          {titleOf(item.id) ??
                            (list.phase === 'ready' ? `${item.id} (목록에 없는 글)` : item.id)}
                        </a>
                      </CountRow>
                    ))}
                  </ul>
                </Section>

                <Section
                  title="들어온 곳"
                  note="방문의 첫 페이지가 어디서 왔는지입니다."
                  empty={summary.refs.length === 0}
                >
                  <ul>
                    {summary.refs.map((item) => (
                      <CountRow key={item.key} count={countText(item.count)}>
                        {refLabel(item.key)}
                      </CountRow>
                    ))}
                  </ul>
                </Section>

                <Section
                  title="블로그 안 검색어"
                  note="결과가 0건이었던 검색어를 먼저 보입니다."
                  empty={summary.searches.length === 0}
                >
                  <ul>
                    {summary.searches.map((item) => (
                      <CountRow key={item.term} count={countText(item.count)}>
                        <span className="text-text-primary">{item.term}</span>
                        {item.zero > 0 && (
                          <span className="ml-2 rounded-pill bg-amber-500/15 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-200">
                            0건 {countText(item.zero)}
                          </span>
                        )}
                      </CountRow>
                    ))}
                  </ul>
                </Section>

                <Section
                  title="없는 주소"
                  note="옛 링크면 리다이렉트 규칙 후보입니다. 아래 작은 글자는 들어온 곳입니다."
                  empty={summary.notFound.length === 0}
                >
                  <ul>
                    {summary.notFound.map((item) => (
                      <CountRow key={item.path} count={countText(item.count)}>
                        <span className="block truncate text-text-primary">
                          {decodePath(item.path)}
                        </span>
                        {item.refs.length > 0 && (
                          <span className="block truncate text-xs text-text-secondary">
                            {item.refs
                              .map((ref) => `${refLabel(ref.key)} ${countText(ref.count)}`)
                              .join(' · ')}
                          </span>
                        )}
                      </CountRow>
                    ))}
                  </ul>
                </Section>
              </div>
            </>
          );
        })()}
    </div>
  );
}
