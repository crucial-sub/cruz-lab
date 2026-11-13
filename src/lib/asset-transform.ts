// 이미지 회전·좌우반전 규칙 (이미지 회전·좌우반전 작업, 사용자 결정 2026-11-12)
// - 방법 (a): 서버가 sharp로 돌린 새 자산(파생 자산)을 만들고 글의 이미지 src를 바꾼다. CSS transform은 쓰지 않는다.
// - 변환 { rotate, flip }은 "좌우반전(flip) 뒤 시계 방향 회전(rotate)"이다. sharp는 한 파이프라인에서
//   호출 순서와 상관없이 flop을 먼저, rotate를 나중에 적용한다(sharp 0.34.4 확인). 그래서 이 정의를 그대로 쓴다.
// - 파생 자산은 언제나 원본(root)에서 만든다. 파생 자산을 다시 돌리지 않으므로 여러 번 눌러도 다시 압축은 한 번이다.
//   합친 변환이 처음 방향이면 원본을 쓴다.
// - 순수 함수만 둔다. 브라우저·서버·단위 테스트가 같이 쓴다.

import { z } from 'zod';

// 시계 방향 회전 각도
export type ImageRotation = 0 | 90 | 180 | 270;

export interface ImageTransform {
  rotate: ImageRotation;
  flip: boolean;
}

// 메뉴 단추 세 가지 (사용자 결정 2026-11-12)
export const TRANSFORM_OPS = ['rotate-left', 'rotate-right', 'flip-horizontal'] as const;
export type TransformOp = (typeof TRANSFORM_OPS)[number];

export const IDENTITY_TRANSFORM: ImageTransform = { rotate: 0, flip: false };

// 자산 문서의 transform 칸 (entry-schema.ts assetDocSchema가 쓴다)
export const imageTransformSchema = z.object({
  rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  flip: z.boolean(),
});

// POST /api/admin/assets/{id}/transform 본문
export const transformRequestSchema = z.object({ op: z.enum(TRANSFORM_OPS) }).strict();

// 각도를 0·90·180·270으로 맞춘다
function normalizeRotation(degrees: number): ImageRotation {
  return (((degrees % 360) + 360) % 360) as ImageRotation;
}

// 지금 변환에 단추 하나를 더한다 (보이는 그림 기준)
// - 오른쪽 90°: R(90)∘R(r)∘F^f = R(r+90)∘F^f
// - 왼쪽 90°: R(r-90)∘F^f
// - 좌우반전: F∘R(r)∘F^f = R(-r)∘F^(1-f) (돌린 그림을 뒤집으면 회전 방향이 반대가 된다)
export function composeTransform(current: ImageTransform, op: TransformOp): ImageTransform {
  if (op === 'rotate-right')
    return { rotate: normalizeRotation(current.rotate + 90), flip: current.flip };
  if (op === 'rotate-left')
    return { rotate: normalizeRotation(current.rotate - 90), flip: current.flip };
  return { rotate: normalizeRotation(-current.rotate), flip: !current.flip };
}

// 처음 방향인지
export function isIdentityTransform(transform: ImageTransform): boolean {
  return transform.rotate === 0 && !transform.flip;
}

// 두 변환이 같은지
export function sameTransform(a: ImageTransform, b: ImageTransform): boolean {
  return a.rotate === b.rotate && a.flip === b.flip;
}

// 돌릴 자산의 정보 (자산 문서의 일부)
export interface TransformSource {
  id: string;
  derivedFrom?: string;
  transform?: ImageTransform;
}

// 요청 하나 → 원본 ID와 원본에 적용할 변환
// - 파생 자산이면 그 원본과, 원본 기준으로 합친 변환을 준다.
export function resolveTransformRequest(
  source: TransformSource,
  op: TransformOp,
): { rootId: string; transform: ImageTransform } {
  if (source.derivedFrom) {
    return {
      rootId: source.derivedFrom,
      transform: composeTransform(source.transform ?? IDENTITY_TRANSFORM, op),
    };
  }
  return { rootId: source.id, transform: composeTransform(IDENTITY_TRANSFORM, op) };
}

// 정리 직전 재검사: 쓰이는 파생 자산의 원본도 "쓰임"으로 본다(새 집합을 돌려준다)
// - 원본이 있어야 파생 자산을 다시 돌리거나 원래 방향으로 돌아올 수 있다.
// - derivedFromById: 파생 자산 ID → 원본 ID
export function withDerivedRoots(
  referenced: ReadonlySet<string>,
  derivedFromById: ReadonlyMap<string, string>,
): Set<string> {
  const result = new Set(referenced);
  for (const id of referenced) {
    const root = derivedFromById.get(id);
    if (root) result.add(root);
  }
  return result;
}
