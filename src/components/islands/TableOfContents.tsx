// 블로그 포스트 목차(TOC) 컴포넌트
// 스크롤 위치에 따라 현재 섹션 하이라이트 + 클릭 네비게이션
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';

interface Heading {
  id: string;
  text: string;
  level: number;
}

interface Props {
  headings: Heading[];
}

export default function TableOfContents({ headings }: Props) {
  const [activeId, setActiveId] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState(false);

  // 스크롤 위치에 따라 현재 활성 섹션 감지
  const handleScroll = useCallback(() => {
    const headingElements = headings
      .map(({ id }) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    const scrollPosition = window.scrollY + 100; // 상단 오프셋

    // 현재 보이는 섹션 찾기
    let currentId = '';
    for (const element of headingElements) {
      if (element.offsetTop <= scrollPosition) {
        currentId = element.id;
      } else {
        break;
      }
    }

    setActiveId(currentId);
  }, [headings]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // 초기 상태 설정
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // 특정 헤딩으로 스크롤
  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 80; // 헤더 높이 고려
      const elementPosition = element.offsetTop - offset;
      window.scrollTo({
        top: elementPosition,
        behavior: 'smooth',
      });
    }
    setIsExpanded(false); // 모바일에서 클릭 후 접기
  };

  if (headings.length === 0) return null;

  return (
    <>
      {/* 데스크탑: 사이드바 TOC */}
      <motion.nav
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="hidden xl:block fixed right-[max(2rem,calc((100vw-72rem)/2-14rem))] top-32 w-56 max-h-[calc(100vh-12rem)] overflow-y-auto"
        aria-label="목차"
      >
        <div className="rounded-xl border border-border bg-bg-surface/80 backdrop-blur-sm p-4">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">목차</h2>
          <ul className="space-y-1">
            {headings.map((heading) => (
              <motion.li
                key={heading.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
              >
                <button
                  onClick={() => scrollToHeading(heading.id)}
                  className={`block w-full text-left text-sm transition-all duration-200 rounded px-2 py-1.5 hover:bg-brand/10 ${
                    heading.level === 2 ? 'pl-2' : ''
                  } ${heading.level === 3 ? 'pl-4 text-xs' : ''} ${
                    heading.level >= 4 ? 'pl-6 text-xs' : ''
                  } ${
                    activeId === heading.id
                      ? 'text-brand font-medium bg-brand/5'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <span className="line-clamp-2">{heading.text}</span>
                </button>
              </motion.li>
            ))}
          </ul>
        </div>
      </motion.nav>

      {/* 모바일: 플로팅 TOC 버튼 */}
      <div className="xl:hidden fixed bottom-6 right-6 z-50">
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-16 right-0 w-64 max-h-80 overflow-y-auto rounded-xl border border-border bg-bg-surface shadow-xl"
            >
              <div className="p-4">
                <h2 className="mb-3 text-sm font-semibold text-text-primary">목차</h2>
                <ul className="space-y-1">
                  {headings.map((heading) => (
                    <li key={heading.id}>
                      <button
                        onClick={() => scrollToHeading(heading.id)}
                        className={`block w-full text-left text-sm transition-colors rounded px-2 py-1.5 ${
                          heading.level === 2 ? 'pl-2' : ''
                        } ${heading.level === 3 ? 'pl-4 text-xs' : ''} ${
                          heading.level >= 4 ? 'pl-6 text-xs' : ''
                        } ${
                          activeId === heading.id
                            ? 'text-brand font-medium bg-brand/5'
                            : 'text-text-secondary hover:text-text-primary hover:bg-brand/10'
                        }`}
                      >
                        <span className="line-clamp-2">{heading.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-lg hover:bg-brand-hover transition-colors"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label={isExpanded ? '목차 닫기' : '목차 열기'}
          aria-expanded={isExpanded}
        >
          <motion.svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            {isExpanded ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 10h16M4 14h16M4 18h16"
              />
            )}
          </motion.svg>
        </motion.button>
      </div>
    </>
  );
}
