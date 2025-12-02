import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

interface Props {
  text: string;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span';
  delay?: number;
  duration?: number;
  staggerChildren?: number;
  type?: 'chars' | 'words' | 'lines';
}

/**
 * TextReveal - 텍스트가 한 글자/단어씩 나타나는 애니메이션
 * 스크롤 시 뷰포트에 들어오면 애니메이션 시작
 */
export default function TextReveal({
  text,
  className = '',
  as: Component = 'p',
  delay = 0,
  duration = 0.5,
  staggerChildren = 0.03,
  type = 'chars'
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  // 텍스트를 타입에 따라 분리
  const getElements = () => {
    switch (type) {
      case 'words':
        return text.split(' ').map((word, i, arr) => (i < arr.length - 1 ? word + ' ' : word));
      case 'lines':
        return text.split('\n');
      case 'chars':
      default:
        return text.split('');
    }
  };

  const elements = getElements();

  const container = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delay,
        staggerChildren
      }
    }
  };

  const child = {
    hidden: {
      opacity: 0,
      y: 20,
      rotateX: -90
    },
    visible: {
      opacity: 1,
      y: 0,
      rotateX: 0,
      transition: {
        duration,
        ease: [0.215, 0.61, 0.355, 1]
      }
    }
  };

  return (
    <motion.span
      ref={ref as React.RefObject<HTMLSpanElement>}
      className={`inline-block ${className}`}
      variants={container}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      style={{ perspective: '1000px' }}
      aria-label={text}
    >
      {elements.map((element, index) => (
        <motion.span
          key={index}
          className="inline-block origin-bottom"
          variants={child}
          style={{
            whiteSpace: element === ' ' ? 'pre' : 'normal',
            transformStyle: 'preserve-3d'
          }}
        >
          {element === ' ' ? '\u00A0' : element}
        </motion.span>
      ))}
    </motion.span>
  );
}
