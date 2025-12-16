import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import CountUp from './CountUp';

interface Stat {
  value: number;
  suffix?: string;
  label: string;
  delay?: number;
}

// 실제 프로젝트 성과 데이터 (Stock Lab 기준)
const stats: Stat[] = [
  { value: 80, suffix: '%', label: '로딩 시간 단축', delay: 0 },
  { value: 90, suffix: '%', label: '네트워크 비용 절감', delay: 0.1 },
  { value: 95, suffix: '%', label: '번들 크기 감소', delay: 0.2 },
  { value: 200, suffix: '+', label: '알고리즘 문제 풀이', delay: 0.3 }
];

/**
 * StatsSection - 통계 카운트업 섹션
 * 숫자가 애니메이션으로 카운트업되는 통계 표시
 */
export default function StatsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section ref={ref} className="py-16">
      <div className="mx-auto max-w-4xl px-4">
        <motion.div
          className="grid grid-cols-2 gap-8 md:grid-cols-4"
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          variants={{
            hidden: {},
            visible: {
              transition: { staggerChildren: 0.1 }
            }
          }}
        >
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              className="text-center"
              variants={{
                hidden: { opacity: 0, y: 30 },
                visible: { opacity: 1, y: 0 }
              }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              <div className="mb-2 text-4xl font-bold text-brand md:text-5xl">
                <CountUp
                  to={stat.value}
                  suffix={stat.suffix}
                  delay={stat.delay}
                  duration={2.5}
                />
              </div>
              <div className="text-sm text-fg-muted">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
