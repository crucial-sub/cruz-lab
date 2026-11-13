// 돌린 이미지의 변형 파일 만들기 테스트 (이미지 회전·좌우반전 작업)
// - 실제 sharp로 사분면 이미지(왼위 빨강, 오른위 초록, 왼아래 파랑, 오른아래 흰색)를 돌린다.
// - 기대 색은 손으로 계산했다. 시계 방향 90°면 새 왼위는 옛 왼아래다.
// - 움직이는 이미지는 sharp가 돌리지 못한다. 422로 거절한다.
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { renderTransformedVariants } from '@/lib/server/image-transform';
import { ApiError } from '@/lib/server/api-response';

type Color = 'red' | 'green' | 'blue' | 'white';
const RGB: Record<Color, [number, number, number]> = {
  red: [255, 0, 0],
  green: [0, 255, 0],
  blue: [0, 0, 255],
  white: [255, 255, 255],
};

// 사분면 이미지를 webp로 만든다 (원천 자산의 max 변형처럼)
async function quadrantWebp(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const top = y < height / 2;
      const left = x < width / 2;
      const color: Color = top ? (left ? 'red' : 'green') : left ? 'blue' : 'white';
      raw.set(RGB[color], (y * width + x) * 3);
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .webp({ quality: 90 })
    .toBuffer();
}

// 이미지 한 점의 색 이름 (손실 압축이라 가까운 색으로 고른다)
async function colorAt(data: Buffer, fx: number, fy: number): Promise<Color> {
  const { data: raw, info } = await sharp(data)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const x = Math.floor(info.width * fx);
  const y = Math.floor(info.height * fy);
  const index = (y * info.width + x) * info.channels;
  const pixel = [raw[index], raw[index + 1], raw[index + 2]];
  let best: Color = 'red';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [name, rgb] of Object.entries(RGB) as [Color, [number, number, number]][]) {
    const distance = rgb.reduce((sum, value, channel) => sum + (value - pixel[channel]) ** 2, 0);
    if (distance < bestDistance) {
      best = name;
      bestDistance = distance;
    }
  }
  return best;
}

describe('renderTransformedVariants', () => {
  it('오른쪽 90°: 가로·세로가 바뀌고 새 폭으로 변형을 만든다', async () => {
    const source = await quadrantWebp(1000, 600);
    const files = await renderTransformedVariants(source, { rotate: 90, flip: false });
    // 새 폭 600 → 480 변형 + 최대 600
    expect(files.map((file) => [file.width, file.height])).toEqual([
      [480, 800],
      [600, 1000],
    ]);
    const max = files[files.length - 1].data;
    expect(await colorAt(max, 0.1, 0.1)).toBe('blue');
    expect(await colorAt(max, 0.9, 0.1)).toBe('red');
    expect(await colorAt(max, 0.1, 0.9)).toBe('white');
  });

  it('좌우반전: 크기는 같고 왼쪽·오른쪽이 바뀐다', async () => {
    const source = await quadrantWebp(1000, 600);
    const files = await renderTransformedVariants(source, { rotate: 0, flip: true });
    expect(files.map((file) => [file.width, file.height])).toEqual([
      [480, 288],
      [960, 576],
      [1000, 600],
    ]);
    const max = files[files.length - 1].data;
    expect(await colorAt(max, 0.1, 0.1)).toBe('green');
    expect(await colorAt(max, 0.9, 0.9)).toBe('blue');
  });

  it('뒤집고 90°: 좌우반전을 먼저 하고 돌린다', async () => {
    const source = await quadrantWebp(1000, 600);
    const files = await renderTransformedVariants(source, { rotate: 90, flip: true });
    const max = files[files.length - 1].data;
    // 뒤집으면 왼아래가 흰색이 되고, 돌리면 그것이 왼위로 온다
    expect(await colorAt(max, 0.1, 0.1)).toBe('white');
    expect(await colorAt(max, 0.9, 0.1)).toBe('green');
  });

  it('결과는 webp다', async () => {
    const source = await quadrantWebp(600, 400);
    const files = await renderTransformedVariants(source, { rotate: 180, flip: false });
    for (const file of files) expect((await sharp(file.data).metadata()).format).toBe('webp');
  });

  it('움직이는 이미지는 422 ANIMATED_NOT_SUPPORTED다', async () => {
    const frameWidth = 4;
    const frameHeight = 3;
    // 두 프레임의 색이 달라야 한다(같으면 webp가 한 프레임으로 합친다)
    const frameBytes = frameWidth * frameHeight * 3;
    const raw = Buffer.alloc(frameBytes * 2);
    for (let i = 0; i < frameBytes; i += 3) {
      raw.set(RGB.red, i);
      raw.set(RGB.blue, frameBytes + i);
    }
    const animated = await sharp(raw, {
      raw: { width: frameWidth, height: frameHeight * 2, channels: 3, pageHeight: frameHeight },
    })
      .webp({ loop: 0 })
      .toBuffer();
    const result = renderTransformedVariants(animated, { rotate: 90, flip: false });
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({ status: 422, code: 'ANIMATED_NOT_SUPPORTED' });
  });
});
