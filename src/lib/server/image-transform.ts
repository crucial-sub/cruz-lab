// 돌린 이미지의 변형 파일 만들기 (이미지 회전·좌우반전 작업)
// - 원천은 원본 자산의 최대 변형(webp)이다. 업로드 원본은 finalize 때 지웠다(EXIF·GPS 제거, 2단계 D6).
// - 한 파이프라인에서 flop(좌우반전) → rotate(시계 방향) → resize 순서로 적용한다.
//   rotate를 resize보다 먼저 부르면 resize는 돌린 뒤의 폭을 기준으로 한다(sharp 0.34.4 확인).
// - 변형 폭은 업로드와 같은 규칙(planVariants)으로 돌린 뒤의 폭에서 정한다.
// - 움직이는 이미지는 sharp가 돌리지 못한다("Rotate is not supported for multi-page images"). 422로 거절한다.
// - Storage·Firestore를 쓰지 않는다. 단위 테스트가 실제 sharp로 부른다.

import sharp from 'sharp';
import { planVariants } from '@/lib/asset-rules';
import type { ImageTransform } from '@/lib/asset-transform';
import { ApiError } from './api-response';

// 변형 webp 품질 (업로드 변형과 같다)
export const TRANSFORM_WEBP_QUALITY = 82;

export interface TransformedFile {
  width: number;
  height: number;
  data: Buffer;
}

// 원천 이미지를 돌려 변형 파일들을 만든다. 폭이 작은 것부터, 마지막이 최대 변형이다
export async function renderTransformedVariants(
  source: Buffer,
  transform: ImageTransform,
): Promise<TransformedFile[]> {
  const metadata = await sharp(source, { animated: true }).metadata();
  if ((metadata.pages ?? 1) > 1) {
    throw new ApiError(422, 'ANIMATED_NOT_SUPPORTED', '움직이는 이미지는 돌릴 수 없습니다.');
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new ApiError(422, 'INVALID_IMAGE', '이미지 크기를 읽을 수 없습니다.');
  }
  // 90°·270°면 가로·세로가 바뀐다
  const quarter = transform.rotate === 90 || transform.rotate === 270;
  const plan = planVariants(quarter ? height : width);

  const files: TransformedFile[] = [];
  for (const targetWidth of plan.widths) {
    let pipeline = sharp(source);
    if (transform.flip) pipeline = pipeline.flop();
    if (transform.rotate !== 0) pipeline = pipeline.rotate(transform.rotate);
    const { data, info } = await pipeline
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp({ quality: TRANSFORM_WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    files.push({ width: info.width, height: info.height, data });
  }
  return files;
}
