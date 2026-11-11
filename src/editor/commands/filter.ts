// 명령 거르기와 최근 사용 순 (재건 3단계 D9: 슬래시 메뉴, 명령 팔레트)
// - 질의는 명령의 title과 id에 맞춘다. 공백과 '-'를 빼고 소문자로 비교한다(/제목2 → "제목 2").
// - 점수: 제목이 질의로 시작 > id가 질의로 시작 > 제목에 질의가 있음 > id에 질의가 있음.
//   같은 점수면 최근 사용 순, 그다음 레지스트리 순이다.
// - 최근 사용 목록은 localStorage에 둔다. 저장소가 막혀 있어도 멈추지 않는다.

export interface Filterable {
  id: string;
  title: string;
}

// 최근 사용 명령을 기억하는 키
export const RECENT_STORAGE_KEY = 'cruz-lab:editor-recent';
const RECENT_MAX = 8;

// 비교용 문자열: 소문자, 공백·'-' 제거
export function normalizeQuery(text: string): string {
  return text.toLowerCase().replace(/[\s-]+/g, '');
}

// 질의와 맞는 정도. 맞지 않으면 null (작을수록 앞)
function scoreOf(command: Filterable, query: string): number | null {
  const title = normalizeQuery(command.title);
  const id = normalizeQuery(command.id);
  if (title.startsWith(query)) return 0;
  if (id.startsWith(query)) return 1;
  if (title.includes(query)) return 2;
  if (id.includes(query)) return 3;
  return null;
}

// 명령을 질의로 거르고 정렬한다. 빈 질의면 모두 보이되 최근 사용을 앞에 둔다
export function filterCommands<T extends Filterable>(
  commands: readonly T[],
  query: string,
  recent: readonly string[],
): T[] {
  const needle = normalizeQuery(query);
  const recentRank = (id: string) => {
    const index = recent.indexOf(id);
    return index === -1 ? Number.POSITIVE_INFINITY : index;
  };
  return commands
    .map((command, order) => ({ command, order, score: needle ? scoreOf(command, needle) : 0 }))
    .filter((item): item is { command: T; order: number; score: number } => item.score !== null)
    .sort(
      (a, b) =>
        a.score - b.score ||
        recentRank(a.command.id) - recentRank(b.command.id) ||
        a.order - b.order,
    )
    .map((item) => item.command);
}

// 실행한 명령을 최근 목록 맨 앞에 넣는다. 중복을 지우고 최대 개수로 자른다
export function recordRecent(recent: readonly string[], id: string, max = RECENT_MAX): string[] {
  return [id, ...recent.filter((item) => item !== id)].slice(0, max);
}

interface RecentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// 저장한 최근 목록을 읽는다. 없거나 깨졌으면 빈 배열
export function readRecent(storage: RecentStorage): string[] {
  try {
    const raw = storage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

// 최근 목록을 저장한다. 저장소가 막혀 있으면 조용히 넘어간다(기능에 꼭 필요하지 않다)
export function writeRecent(storage: RecentStorage, recent: readonly string[]): void {
  try {
    storage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recent));
  } catch {
    // 개인 정보 보호 모드 등에서는 저장하지 못한다
  }
}
