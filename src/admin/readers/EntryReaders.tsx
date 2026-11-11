// 글 하나의 독자 화면 /admin/readers/<글 ID> (재건 5단계 D20)
// - 날짜별 방문 막대, 수 칸(방문·조회·75%까지 읽음·끝까지 읽음·여기서 떠남·바깥 링크·코드 복사),
//   들어온 곳, 이 글 다음에 읽은 글, 이 글 전에 읽은 글, 방문 경로 예(최근 방문 10개).
// - 비율의 분모는 조회 수다(페이지를 연 번 중 몇 번). 떠남 = 조회 − 같은 방문에서 다음 페이지로 간 수.
// - 글 제목·공개 주소는 관리자 목록에서 찾는다. 목록에 없으면(지운 글) ID를 보인다. 기록은 그대로 보인다.

import { useMemo, useState } from 'react';
import { classNames } from '@/editor/ui/class-names';
import type { VisitPath } from '@/lib/server/reader-store';
import { exitsOf, rateOf } from '@/lib/tracker/daily';
import { useAdmin } from '../app-context';
import { editPath, entryReadersPath } from '../router';
import { BarChart } from './BarChart';
import {
  CountRow,
  PeriodToggle,
  Section,
  Stat,
  useEntryTitles,
  useReaderData,
} from './ReaderParts';
import {
  countText,
  decodePath,
  percentText,
  readersApi,
  refLabel,
  shortDayText,
  type ReaderDays,
} from './readers-api';

interface PathPart {
  label: string;
  current: boolean;
  // 그 페이지에서 가장 깊이 읽은 곳(75·100)과 코드 복사 여부. 글자는 마지막에 만든다(순서가 섞여도 같은 모양)
  depth: number;
  copied: boolean;
}

function partText(part: PathPart): string {
  return `${part.label}${part.depth ? ` (${part.depth}%)` : ''}${part.copied ? ' · 코드 복사' : ''}`;
}

// 방문 하나의 이벤트 → 화면 조각들(들어온 곳 → 페이지 → 페이지 …). 읽은 깊이·코드 복사는 그 페이지 조각에 붙인다
function visitParts(
  path: VisitPath,
  entryId: string,
  titleOf: (id: string) => string | null,
): PathPart[] {
  const parts: PathPart[] = [];
  const plain = (label: string): PathPart => ({ label, current: false, depth: 0, copied: false });
  // 마지막 페이지 조각(바깥 링크·PDF 조각 뒤에 온 read·copy도 그 페이지에 붙인다)
  let page: PathPart | null = null;
  for (const step of path.steps) {
    if (step.type === 'view' || step.type === '404') {
      if (step.seq === 1 && step.ref) parts.push(plain(refLabel(step.ref)));
      const label =
        step.type === '404'
          ? `없는 주소 ${decodePath(step.path)}`
          : step.entryId
            ? (titleOf(step.entryId) ?? step.entryId)
            : decodePath(step.path);
      page = { ...plain(label), current: step.entryId === entryId };
      parts.push(page);
    } else if (step.type === 'read' && page) {
      page.depth = Math.max(page.depth, step.depth ?? 0);
    } else if (step.type === 'copy' && page) {
      page.copied = true;
    } else if (step.type === 'out') {
      parts.push(plain(`바깥 ${step.domain ?? ''}`.trim()));
    } else if (step.type === 'pdf') {
      parts.push(plain('이력서 PDF'));
    }
  }
  return parts;
}

export function EntryReaders({ id }: { id: string }) {
  const [days, setDays] = useState<ReaderDays>(30);
  const state = useReaderData(() => readersApi.entry(id, days), [id, days]);
  const titleOf = useEntryTitles();
  const { list } = useAdmin();
  const item = useMemo(
    () => (list.phase === 'ready' ? list.items.find((entry) => entry.id === id) : undefined),
    [list, id],
  );
  const title = titleOf(id);

  return (
    <div>
      <a href="/admin/readers" className="text-sm text-text-secondary hover:text-text-primary">
        ← 독자
      </a>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-xl font-bold">{title ?? id}</h1>
          <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-text-secondary">
            {title === null && list.phase === 'ready' && (
              <span>목록에 없는 글입니다(지운 글일 수 있습니다).</span>
            )}
            {item && (
              <a href={editPath(id)} className="hover:text-text-primary">
                에디터에서 열기
              </a>
            )}
            {item?.publicPath && item.status === 'published' && (
              <a
                href={item.publicPath}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-text-primary"
              >
                공개 페이지 ↗
              </a>
            )}
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
          const { summary, paths } = state.data;
          const { totals } = summary;
          const exits = exitsOf(totals);
          return (
            <>
              <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                <Stat label="방문" value={countText(totals.visits)} />
                <Stat label="조회" value={countText(totals.views)} />
                <Stat
                  label="75%까지 읽음"
                  value={percentText(rateOf(totals.read75, totals.views))}
                  note={`${countText(totals.read75)}번`}
                />
                <Stat
                  label="끝까지 읽음"
                  value={percentText(rateOf(totals.read100, totals.views))}
                  note={`${countText(totals.read100)}번`}
                />
                <Stat
                  label="여기서 떠남"
                  value={percentText(rateOf(exits, totals.views))}
                  note={`${countText(exits)}번`}
                />
                <Stat label="바깥 링크" value={countText(totals.out)} />
                <Stat label="코드 복사" value={countText(totals.copy)} />
              </dl>

              <div className="mt-5 rounded-lg border border-border bg-bg-surface p-4">
                <BarChart
                  points={summary.daily.map((point) => ({ day: point.day, value: point.visits }))}
                  label="날짜별 방문"
                />
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <Section
                  title="들어온 곳"
                  note="이 글을 열기 바로 전입니다(첫 페이지면 바깥 사이트)."
                  empty={summary.refs.length === 0}
                >
                  <ul>
                    {summary.refs.map((ref) => (
                      <CountRow key={ref.key} count={countText(ref.count)}>
                        {refLabel(ref.key)}
                      </CountRow>
                    ))}
                  </ul>
                </Section>

                <Section
                  title="이 글 다음에 읽은 글"
                  note="같은 방문 안에서 바로 다음에 연 글입니다."
                  empty={summary.next.length === 0}
                >
                  <ul>
                    {summary.next.map((other) => (
                      <CountRow key={other.key} count={countText(other.count)}>
                        <a
                          href={entryReadersPath(other.key)}
                          className="text-text-primary hover:underline"
                        >
                          {titleOf(other.key) ?? other.key}
                        </a>
                      </CountRow>
                    ))}
                  </ul>
                </Section>

                <Section
                  title="이 글 전에 읽은 글"
                  note="같은 방문 안에서 바로 전에 연 글입니다."
                  empty={summary.prev.length === 0}
                >
                  <ul>
                    {summary.prev.map((other) => (
                      <CountRow key={other.key} count={countText(other.count)}>
                        <a
                          href={entryReadersPath(other.key)}
                          className="text-text-primary hover:underline"
                        >
                          {titleOf(other.key) ?? other.key}
                        </a>
                      </CountRow>
                    ))}
                  </ul>
                </Section>

                <Section
                  title="방문 경로 예"
                  note="이 글을 연 최근 방문 10개입니다. 괄호는 읽은 깊이입니다."
                  empty={paths.length === 0}
                >
                  <ol className="flex flex-col gap-2">
                    {paths.map((path, index) => (
                      <li key={index} className="text-sm">
                        <span className="mr-2 text-xs text-text-secondary">
                          {shortDayText(path.day)}
                        </span>
                        {visitParts(path, id, titleOf).map((part, partIndex) => (
                          <span key={partIndex}>
                            {partIndex > 0 && <span className="mx-1 text-text-secondary">→</span>}
                            <span
                              className={classNames(
                                'break-words',
                                part.current
                                  ? 'font-semibold text-text-primary'
                                  : 'text-text-secondary',
                              )}
                            >
                              {partText(part)}
                            </span>
                          </span>
                        ))}
                      </li>
                    ))}
                  </ol>
                </Section>
              </div>
            </>
          );
        })()}
    </div>
  );
}
