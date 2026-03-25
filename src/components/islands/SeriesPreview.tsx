// Home 페이지용 시리즈 미리보기 섹션
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Series } from '@/lib/series';
import SeriesCard from './SeriesCard';
import MagneticButton from './MagneticButton';
import TextReveal from './TextReveal';

interface SeriesWithTime extends Series {
  totalReadingTime: number;
}

interface Props {
  series?: SeriesWithTime[];
}

export default function SeriesPreview({ series: initialSeries = [] }: Props) {
  const [series, setSeries] = useState<SeriesWithTime[]>(initialSeries);
  const [isLoading, setIsLoading] = useState(initialSeries.length === 0);

  useEffect(() => {
    if (initialSeries.length > 0) return;

    async function fetchSeries() {
      try {
        const response = await fetch('/api/series-preview');
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || '시리즈를 불러오지 못했습니다.');
        }

        setSeries(result.items || []);
      } catch (error) {
        console.error('시리즈 로딩 오류:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchSeries();
  }, [initialSeries]);

  return (
    <section className="py-16">
      {/* 섹션 헤더 */}
      <div className="mb-12 flex flex-col items-center justify-between gap-4 sm:flex-row">
        <div>
          <h2 className="mb-2 text-3xl font-bold md:text-4xl">
            <TextReveal text="Featured " type="chars" staggerChildren={0.05} />
            <span className="text-brand">
              <TextReveal text="Series" type="chars" staggerChildren={0.05} delay={0.3} />
            </span>
          </h2>
          <p className="text-text-secondary">연재 중인 시리즈를 만나보세요</p>
        </div>
        <MagneticButton href="/series" strength={0.2}>
          <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-surface/50 px-4 py-2 font-medium transition-colors hover:border-brand hover:text-brand">
            모든 시리즈 보기
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
          </span>
        </MagneticButton>
      </div>

      {/* 로딩 상태 */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      )}

      {series.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {series.slice(0, 3).map((item, index) => (
            <SeriesCard
              key={item.id}
              {...item}
              index={index}
            />
          ))}
        </div>
      )}

      {/* 시리즈가 없을 경우 */}
      {series.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="py-8 text-center"
        >
          <p className="text-text-secondary">아직 등록된 시리즈가 없습니다.</p>
        </motion.div>
      )}
    </section>
  );
}
