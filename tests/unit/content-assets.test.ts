// 본문 이미지 srcset·크기와 이미지 규칙 테스트 (재건 4단계 D15, D3)
import { describe, expect, it } from 'vitest';
import { markdownToHtml, type RenderAsset } from '@/lib/content/markdown';
import { CONTENT_IMAGE_SIZES, srcsetOf } from '@/lib/content/rehype-assets';

const BUCKET = 'cruz-lab.firebasestorage.app';

// 우리 버킷의 assets/{id}/{name} 다운로드 주소
function assetUrl(id: string, name: string, bucket = BUCKET) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(`assets/${id}/${name}`)}?alt=media&token=t-${name}`;
}

const variant = (id: string, name: string, width: number, height: number) => ({
  url: assetUrl(id, name),
  width,
  height,
});

const NEW_ASSET: RenderAsset = {
  variants: {
    w480: variant('a1', 'w480.webp', 480, 270),
    w960: variant('a1', 'w960.webp', 960, 540),
    w1600: variant('a1', 'w1600.webp', 1600, 900),
    max: variant('a1', 'max.webp', 2400, 1350),
  },
};
const SMALL_ORIGINAL: RenderAsset = {
  // 원본이 작아 작은 변형이 없다(planVariants)
  variants: { max: variant('a2', 'max.webp', 400, 300) },
};
const LEGACY: RenderAsset = { variants: null };

const assets = {
  byId: new Map<string, RenderAsset>([
    ['a1', NEW_ASSET],
    ['a2', SMALL_ORIGINAL],
    ['legacy1', LEGACY],
  ]),
  bucket: BUCKET,
};

const render = (markdown: string) => markdownToHtml(markdown, { assets });

describe('새 자산 srcset (D15)', () => {
  it('최대 변형 주소면 srcset·sizes·width·height', () => {
    const html = render(`![그림](${assetUrl('a1', 'max.webp')})`);
    expect(html).toContain(`srcset="${srcsetOf(NEW_ASSET.variants!).replaceAll('&', '&#x26;')}"`);
    expect(html).toContain(`sizes="${CONTENT_IMAGE_SIZES}"`);
    expect(html).toContain('width="2400" height="1350"');
    expect(html).toContain('loading="lazy" decoding="async"');
  });

  it('srcset은 있는 변형만, 같은 폭은 한 번만', () => {
    expect(
      srcsetOf(NEW_ASSET.variants!)
        .split(', ')
        .map((part) => part.split(' ')[1]),
    ).toEqual(['480w', '960w', '1600w', '2400w']);
    expect(srcsetOf(SMALL_ORIGINAL.variants!)).toBe(`${assetUrl('a2', 'max.webp')} 400w`);
    const sameWidth = {
      max: variant('a3', 'max.webp', 960, 540),
      w960: variant('a3', 'w960.webp', 960, 540),
    };
    expect(srcsetOf(sameWidth).split(', ')).toHaveLength(1);
  });

  it('작성자가 고른 작은 변형은 srcset 없이 그 크기만 붙인다', () => {
    const html = render(`![작게](${assetUrl('a1', 'w480.webp')})`);
    expect(html).not.toContain('srcset');
    expect(html).toContain('width="480" height="270"');
  });

  it('legacy 자산·자산 맵에 없는 ID·다른 버킷·외부 이미지는 주소 그대로다', () => {
    for (const src of [
      assetUrl('legacy1', 'max.webp'),
      assetUrl('unknown', 'max.webp'),
      assetUrl('a1', 'max.webp', 'other-bucket'),
      'https://user-images.githubusercontent.com/1/a.png',
      `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/images%2Fold.png?alt=media`,
    ]) {
      const html = render(`![x](${src})`);
      expect(html, src).not.toContain('srcset');
      expect(html, src).not.toContain('width=');
      expect(html, src).toContain('loading="lazy" decoding="async"');
    }
  });

  it('자산 맵이 없으면(에디터 미리보기) srcset이 없다', () => {
    expect(markdownToHtml(`![그림](${assetUrl('a1', 'max.webp')})`)).not.toContain('srcset');
  });

  it('원시 HTML <img width>는 작성자 크기를 지키고 srcset만 더한다', () => {
    const html = render(`<img src="${assetUrl('a1', 'max.webp')}" alt="x" width="600">`);
    expect(html).toContain('width="600"');
    expect(html).not.toContain('height="1350"');
    expect(html).toContain('srcset=');
  });

  it('영상 주소는 건드리지 않는다', () => {
    const html = render(`![영상](${assetUrl('a1', 'max.mp4')})`);
    expect(html).toContain('<video');
    expect(html).not.toContain('srcset');
  });
});

describe('원시 이미지 HTML이 그대로 그려진다 (D3: 이미지 세부 조절은 5단계, 렌더러는 길을 열어 둔다)', () => {
  it('<img width>와 <p align="center">를 통과시킨다', () => {
    const html = markdownToHtml(
      '<p align="center"><img src="https://e.com/a.png" alt="가운데" width="600"></p>',
    );
    expect(html).toContain('<p align="center">');
    expect(html).toContain('width="600"');
    expect(html).toContain('src="https://e.com/a.png"');
  });

  it('원시 img의 srcset·이벤트 속성은 지운다 (rehype-strip-unsafe)', () => {
    const html = markdownToHtml(
      '<img src="https://e.com/a.png" srcset="javascript:x 1w" onerror="x()">',
    );
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('onerror');
  });
});

describe('표 가로 스크롤 상자', () => {
  it('표를 div.table-scroll로 감싼다', () => {
    const html = markdownToHtml('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(html).toContain(
      '<div class="table-scroll" tabindex="0" role="region" aria-label="표"><table>',
    );
    expect(html.match(/table-scroll/g)).toHaveLength(1);
  });
});

describe('표 상자 접근성 (리뷰 경미 11)', () => {
  it('스크롤 상자는 이름 있는 영역이다', () => {
    const html = markdownToHtml('| a |\n| - |\n| 1 |');
    expect(html).toContain('<div class="table-scroll" tabindex="0" role="region" aria-label="표">');
  });
});
