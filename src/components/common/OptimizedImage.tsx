// 최적화된 이미지 컴포넌트
// Picture 태그, WebP 지원, LQIP 블러 효과
import { generateSrcSet, getDefaultSizes, getBlurStyle } from '@/lib/image-utils';

interface Props {
  src: string;
  alt: string;
  widths?: number[];
  sizes?: string;
  className?: string;
  blurDataURL?: string;
  loading?: 'lazy' | 'eager';
  style?: React.CSSProperties;
}

export default function OptimizedImage({
  src,
  alt,
  widths = [400, 800, 1200],
  sizes = getDefaultSizes(),
  className = '',
  blurDataURL,
  loading = 'lazy',
  style = {},
}: Props) {
  const srcSet = generateSrcSet(src, widths);
  const blurStyle = getBlurStyle(blurDataURL);

  return (
    <picture>
      <source srcSet={srcSet} sizes={sizes} type="image/webp" />
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        className={className}
        style={{ ...blurStyle, ...style }}
      />
    </picture>
  );
}
