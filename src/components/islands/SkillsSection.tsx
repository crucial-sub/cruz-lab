// 스킬 섹션 컴포넌트
// 카테고리별 기술 스택 표시
import { motion } from 'framer-motion';
import SkillCard from './SkillCard';
import TextReveal from './TextReveal';

// 스킬 데이터 정의
const skillCategories = [
  {
    title: 'Frontend',
    skills: [
      { name: 'JavaScript', icon: '/images/Javascript.svg', color: '#F7DF1E' },
      { name: 'TypeScript', icon: '/images/TypeScript.svg', color: '#3178C6' },
      { name: 'React', icon: '/images/React.svg', color: '#61DAFB' },
      { name: 'Next.js', icon: '/images/Nextjs.svg', color: '#000000' },
      { name: 'TailwindCSS', icon: '/images/TailwindCSS.svg', color: '#06B6D4' },
      { name: 'React Query', icon: '/images/React Query.svg', color: '#FF4154' },
      { name: 'Zustand', icon: '/images/Zustand.svg', color: '#433e38' },
    ],
  },
  {
    title: 'Backend & Systems',
    skills: [
      { name: 'Python', icon: '/images/Python.svg', color: '#3776AB' },
      { name: 'Firebase', icon: '/images/Firebase.svg', color: '#FFCA28' },
    ],
  },
  {
    title: 'Tools & Others',
    skills: [
      { name: 'Git', icon: '/images/Git.svg', color: '#F05032' },
      { name: 'Figma', icon: '/images/Figma.svg', color: '#F24E1E' },
    ],
  },
];

export default function SkillsSection() {
  return (
    <section className="py-16">
      {/* 섹션 헤더 - TextReveal 적용 */}
      <div className="mb-12 text-center">
        <h2 className="mb-4 text-3xl font-bold md:text-4xl">
          <TextReveal text="Tech " type="chars" staggerChildren={0.05} />
          <span className="text-brand">
            <TextReveal text="Stack" type="chars" staggerChildren={0.05} delay={0.3} />
          </span>
        </h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mx-auto max-w-2xl text-text-secondary"
        >
          다양한 기술을 활용하여 아이디어를 현실로 만듭니다
        </motion.p>
      </div>

      {/* 카테고리별 스킬 그리드 */}
      <div className="space-y-12">
        {skillCategories.map((category, categoryIndex) => (
          <motion.div
            key={category.title}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: categoryIndex * 0.1 }}
          >
            <h3 className="mb-6 text-lg font-semibold text-text-secondary">
              {category.title}
            </h3>
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {category.skills.map((skill, skillIndex) => (
                <SkillCard
                  key={skill.name}
                  name={skill.name}
                  icon={skill.icon}
                  color={skill.color}
                  imgClassName={skill.name === 'Zustand' ? 'h-full w-full' : ''} // Zustand만 크기 조정
                  index={categoryIndex * 5 + skillIndex}
                />
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {/* 추가 설명 */}
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="mt-12 text-center text-sm text-text-secondary"
      >
      </motion.p>
    </section>
  );
}
