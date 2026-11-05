// 블로그 카드 커버
// - 업로드 이미지 없이 코드로 그린다: 메시 그라디언트 + 필름 노이즈 + 기울어진 격자 + 큰 카테고리 글자
// - 이미지 요청이 없어 목록 페이지가 이미지 수십 장을 받지 않는다.
// - 호버하면 그라디언트 층만 transform으로 움직인다 (GPU 합성만 사용).
import { getCoverTheme } from '@/lib/post-cover';

interface Props {
  title: string;
  tags: string[];
  slug: string;
  date: Date;
  compact?: boolean; // 리스트 보기처럼 좁은 칸에 넣을 때
}

// 필름 노이즈 (SVG feTurbulence). 한 번 그려 두고 움직이지 않는다
const NOISE_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export default function PostCover({ title, tags, slug, date, compact = false }: Props) {
  const { label, palette, blobPositions, angle } = getCoverTheme(title, tags, slug);

  // 블롭 3개를 radial-gradient로 겹쳐 메시 그라디언트를 만든다
  const mesh = blobPositions
    .map(
      (b, i) =>
        `radial-gradient(circle at ${b.x}% ${b.y}%, ${palette.blobs[i]}cc 0%, ${palette.blobs[i]}00 ${b.r}%)`
    )
    .join(', ');

  const stamp = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
  // 라벨이 길면 글자 크기를 줄인다
  const labelSize = label.length > 12 ? 'text-3xl' : label.length > 7 ? 'text-4xl' : 'text-5xl';

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ backgroundColor: palette.base }}
      aria-hidden="true"
    >
      {/* 메시 그라디언트 (호버 시 천천히 확대·이동) */}
      <div
        className="absolute -inset-[15%] transition-transform duration-700 ease-out will-change-transform group-hover:-translate-y-[4%] group-hover:scale-110"
        style={{ backgroundImage: mesh }}
      />

      {/* 기울어진 격자 (가장자리로 갈수록 흐려진다) */}
      <div
        className="absolute -inset-[30%] opacity-[0.18]"
        style={{
          transform: `rotate(${angle}deg)`,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse at 70% 30%, black 10%, transparent 60%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 70% 30%, black 10%, transparent 60%)',
        }}
      />

      {/* 필름 노이즈 */}
      <div className="absolute inset-0 opacity-40 mix-blend-overlay" style={{ backgroundImage: NOISE_URL }} />

      {/* 아래쪽을 어둡게 해 글자를 읽기 쉽게 한다 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/10" />

      {/* 상단 메타 */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 font-mono text-[11px] uppercase tracking-[0.18em] text-white/70">
        <span>cruz-lab / {stamp}</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-white/10 backdrop-blur-sm transition-transform duration-300 group-hover:-rotate-45 group-hover:bg-white/20">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        </span>
      </div>

      {/* 큰 카테고리 글자 */}
      <div className={`absolute inset-x-0 bottom-0 ${compact ? 'p-4' : 'p-5'}`}>
        <span
          className={`block font-extrabold leading-[0.9] tracking-[-0.04em] ${compact ? 'text-3xl' : labelSize}`}
          style={{
            color: palette.ink,
            textShadow: '0 2px 24px rgba(0,0,0,0.25)',
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
