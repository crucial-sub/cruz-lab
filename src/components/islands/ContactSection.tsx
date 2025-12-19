// 연락처 섹션 컴포넌트
// 소셜 링크와 이메일 연락 CTA
import { motion } from 'framer-motion';
import MagneticButton from './MagneticButton';
import TextReveal from './TextReveal';

const socialLinks = [
  {
    name: 'GitHub',
    url: 'https://github.com/crucial-sub',
    icon: (
      <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
    ),
    color: '#333',
  },
  {
    name: 'LinkedIn',
    url: 'https://www.linkedin.com/in/중섭-박-41a678380',
    icon: (
      <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
    color: '#0A66C2',
  },
  {
    name: 'Resume',
    url: '/resume.pdf',
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
    color: '#FF5722',
  },
  {
    name: 'Email',
    url: '#',
    action: () => {
      navigator.clipboard.writeText('jssub940@gmail.com');
      alert('이메일 주소가 복사되었습니다!');
    },
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
    color: '#10B981',
  },
];

export default function ContactSection() {
  return (
    <section className="py-16">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-bg-surface p-8 md:p-12">
        {/* 배경 장식 */}
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/5 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-brand/5 blur-3xl" />

        <div className="relative z-10">
          {/* 헤더 - TextReveal 적용 */}
          <div className="mb-8 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              <TextReveal text="Let's " type="chars" staggerChildren={0.05} />
              <span className="text-brand">
                <TextReveal text="Connect" type="chars" staggerChildren={0.05} delay={0.3} />
              </span>
            </h2>
          </div>

          {/* 소셜 링크들 - MagneticButton 적용 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-wrap justify-center gap-4"
          >
            {socialLinks.map((link, index) => (
              <MagneticButton key={link.name} strength={0.15}>
                <motion.a
                  href={link.url}
                  onClick={(e) => {
                    if (link.action) {
                      e.preventDefault();
                      link.action();
                    }
                  }}
                  target={link.url.startsWith('http') ? '_blank' : undefined}
                  rel={link.url.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-bg-secondary/50 px-6 py-3 transition-all duration-300 hover:border-transparent hover:shadow-lg"
                  style={
                    {
                      '--hover-color': link.color,
                    } as React.CSSProperties
                  }
                  whileHover={{
                    boxShadow: `0 10px 30px -10px ${link.color}40`,
                  }}
                  whileTap={{ scale: 0.95 }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = link.color;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '';
                  }}
                >
                  <span
                    className="text-text-secondary transition-colors group-hover:text-[var(--hover-color)]"
                    style={{ color: undefined }}
                  >
                    {link.icon}
                  </span>
                  <span className="font-medium text-text-primary">{link.name}</span>
                </motion.a>
              </MagneticButton>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
