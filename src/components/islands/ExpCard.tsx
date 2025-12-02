// 경력/교육 카드 컴포넌트
// 클릭 시 부드럽게 펼쳐지는 아코디언 기능
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useId, type ReactNode } from 'react';

type Tag = { label: string; href?: string };

type Props = {
  title: string;
  category?: string;
  date?: string;
  subtitle?: string;
  tags?: Tag[];
  className?: string;
  children?: ReactNode;
  defaultOpen?: boolean;
};

export default function ExpCard({
  title,
  category,
  date,
  subtitle,
  tags = [],
  className,
  children,
  defaultOpen = false,
}: Props) {
  const uid = useId();
  const panelId = `${uid}-panel`;
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const handleToggle = () => {
    if (children) {
      setIsOpen(!isOpen);
    }
  };

  return (
    <motion.div
      data-exp-card
      className={[
        'group/exp rounded-xl border border-border',
        'bg-[rgb(var(--bg-surface-rgb)/0.65)] shadow-card',
        'ring-[color:var(--ring-focus)] transition-all duration-300',
        'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20',
        'hover:border-brand/30 hover:ring-1',
        'focus-within:ring-1 motion-reduce:transition-none',
        className || '',
      ].join(' ')}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
    >
      {/* 헤더 (토글 버튼) */}
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={`flex w-full items-start justify-between gap-4 p-4 text-left md:p-5 ${
          children ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        <div className="min-w-0">
          <div className="text-sm text-text-secondary">
            {category}
            {date ? ` · ${date}` : ''}
          </div>
          <h3 className="mt-1 text-lg font-semibold text-text-primary md:text-xl">{title}</h3>
          {subtitle && <p className="mt-1 line-clamp-2 text-text-secondary">{subtitle}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {tags.map((t, i) =>
            t.href ? (
              <a
                key={i}
                href={t.href}
                onClick={(e) => e.stopPropagation()}
                className="tag tag-sm"
              >
                {t.label}
              </a>
            ) : (
              <span key={i} className="tag tag-sm">
                {t.label}
              </span>
            ),
          )}
          {/* 펼침/접힘 아이콘 (children이 있을 때만 표시) */}
          {children && (
            <motion.svg
              className="ml-1 h-5 w-5 text-text-secondary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ duration: 0.3 }}
            >
              <path d="m6 9 6 6 6-6" />
            </motion.svg>
          )}
        </div>
      </button>

      {/* 본문: 애니메이션과 함께 펼침/접힘 */}
      <AnimatePresence initial={false}>
        {isOpen && children && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 md:px-5 md:pb-5">
              <div className="border-t border-border/50 pt-4 text-text-secondary">
                {children}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
