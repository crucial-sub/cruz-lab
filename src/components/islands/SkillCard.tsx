// 스킬 카드 컴포넌트
// 호버 시 확대 및 글로우 효과
import { motion } from 'framer-motion';

interface Props {
  name: string;
  icon: string;
  color: string;
  level?: number; // 1-5 숙련도
  index?: number;
}

export default function SkillCard({ name, icon, color, index = 0 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      whileHover={{ scale: 1.1, y: -5 }}
      className="group relative"
    >
      <div
        className="flex flex-col items-center gap-2 rounded-xl border border-border bg-bg-surface p-4 transition-all duration-300 group-hover:border-transparent group-hover:shadow-lg"
        style={{
          boxShadow: `0 0 0 0 ${color}00`,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = `0 0 20px 2px ${color}40`;
          e.currentTarget.style.borderColor = color;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = `0 0 0 0 ${color}00`;
          e.currentTarget.style.borderColor = '';
        }}
      >
        {/* 아이콘 */}
        <div
          className="flex h-12 w-12 items-center justify-center text-3xl"
          dangerouslySetInnerHTML={{ __html: icon }}
        />

        {/* 스킬명 */}
        <span className="text-sm font-medium text-text-primary">{name}</span>
      </div>
    </motion.div>
  );
}
