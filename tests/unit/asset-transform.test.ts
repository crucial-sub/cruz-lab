// 이미지 회전·좌우반전 규칙 테스트 (이미지 회전·좌우반전 작업, 사용자 결정 2026-11-12)
// - 변환 { rotate, flip }은 "좌우반전 뒤 시계 방향 회전"이다. 기대값은 손으로 계산했다.
// - 파생 자산은 언제나 원본(root)에서 만든다. 원래 방향으로 돌아오면 원본을 쓴다.
// - 정리(purge)는 쓰이는 파생 자산의 원본을 지우지 않는다.
import { describe, expect, it } from 'vitest';
import {
  composeTransform,
  IDENTITY_TRANSFORM,
  isIdentityTransform,
  resolveTransformRequest,
  sameTransform,
  transformRequestSchema,
  withDerivedRoots,
  type ImageTransform,
  type TransformOp,
} from '@/lib/asset-transform';
import { assetDocSchema } from '@/lib/entry-schema';

// 처음 방향에서 단추를 차례로 누른 결과
function press(...ops: TransformOp[]): ImageTransform {
  return ops.reduce(composeTransform, IDENTITY_TRANSFORM);
}

describe('composeTransform: 단추 하나를 더한다', () => {
  it('오른쪽 90°는 시계 방향 90°다', () => {
    expect(press('rotate-right')).toEqual({ rotate: 90, flip: false });
  });

  it('왼쪽 90°는 시계 방향 270°다', () => {
    expect(press('rotate-left')).toEqual({ rotate: 270, flip: false });
  });

  it('좌우반전은 회전 없이 뒤집기만 한다', () => {
    expect(press('flip-horizontal')).toEqual({ rotate: 0, flip: true });
  });

  it('오른쪽 90°를 네 번 누르면 처음 방향이다', () => {
    expect(press('rotate-right', 'rotate-right', 'rotate-right', 'rotate-right')).toEqual({
      rotate: 0,
      flip: false,
    });
  });

  it('왼쪽과 오른쪽은 서로 지운다', () => {
    expect(press('rotate-left', 'rotate-right')).toEqual({ rotate: 0, flip: false });
  });

  it('좌우반전을 두 번 누르면 처음 방향이다', () => {
    expect(press('flip-horizontal', 'flip-horizontal')).toEqual({ rotate: 0, flip: false });
  });

  // 돌린 그림을 보이는 대로 뒤집으면 회전 방향이 반대가 된다: F∘R(90) = R(270)∘F
  it('오른쪽 90° 뒤의 좌우반전은 "뒤집고 270°"다', () => {
    expect(press('rotate-right', 'flip-horizontal')).toEqual({ rotate: 270, flip: true });
  });

  it('뒤집은 그림을 오른쪽으로 돌리면 "뒤집고 90°"다', () => {
    expect(press('flip-horizontal', 'rotate-right')).toEqual({ rotate: 90, flip: true });
  });

  // R(90)∘F∘R(90) = F
  it('오른쪽 → 좌우반전 → 오른쪽은 좌우반전 하나와 같다', () => {
    expect(press('rotate-right', 'flip-horizontal', 'rotate-right')).toEqual({
      rotate: 0,
      flip: true,
    });
  });
});

describe('isIdentityTransform·sameTransform', () => {
  it('회전 0°이고 뒤집지 않았으면 처음 방향이다', () => {
    expect(isIdentityTransform({ rotate: 0, flip: false })).toBe(true);
    expect(isIdentityTransform({ rotate: 0, flip: true })).toBe(false);
    expect(isIdentityTransform({ rotate: 180, flip: false })).toBe(false);
  });

  it('회전과 뒤집기가 모두 같아야 같은 변환이다', () => {
    expect(sameTransform({ rotate: 90, flip: true }, { rotate: 90, flip: true })).toBe(true);
    expect(sameTransform({ rotate: 90, flip: true }, { rotate: 90, flip: false })).toBe(false);
    expect(sameTransform({ rotate: 90, flip: true }, { rotate: 270, flip: true })).toBe(false);
  });
});

describe('resolveTransformRequest: 원본과 만들 변환', () => {
  it('원본 자산을 돌리면 원본 ID와 그 변환이다', () => {
    expect(resolveTransformRequest({ id: 'A' }, 'rotate-right')).toEqual({
      rootId: 'A',
      transform: { rotate: 90, flip: false },
    });
  });

  it('파생 자산을 돌리면 원본 ID에서 합친 변환이다(파생 자산을 다시 돌리지 않는다)', () => {
    expect(
      resolveTransformRequest(
        { id: 'B', derivedFrom: 'A', transform: { rotate: 90, flip: false } },
        'rotate-right',
      ),
    ).toEqual({ rootId: 'A', transform: { rotate: 180, flip: false } });
  });

  it('원래 방향으로 돌아오면 변환은 처음 방향이다(원본 A를 쓴다)', () => {
    const result = resolveTransformRequest(
      { id: 'B', derivedFrom: 'A', transform: { rotate: 90, flip: false } },
      'rotate-left',
    );
    expect(result.rootId).toBe('A');
    expect(isIdentityTransform(result.transform)).toBe(true);
  });
});

describe('transformRequestSchema: 요청 본문', () => {
  it('단추 세 가지만 받는다', () => {
    for (const op of ['rotate-left', 'rotate-right', 'flip-horizontal']) {
      expect(transformRequestSchema.safeParse({ op }).success).toBe(true);
    }
    expect(transformRequestSchema.safeParse({ op: 'flip-vertical' }).success).toBe(false);
    expect(transformRequestSchema.safeParse({ op: 'rotate-right', extra: 1 }).success).toBe(false);
    expect(transformRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('assetDocSchema: 파생 자산 칸', () => {
  const variant = {
    path: 'assets/B/w600.webp',
    url: 'https://e.com/b',
    width: 600,
    height: 1000,
    bytes: 10,
  };
  const derived = {
    storagePath: variant.path,
    url: variant.url,
    contentType: 'image/webp',
    bytes: 10,
    width: 600,
    height: 1000,
    sha256: 'a'.repeat(64),
    variants: { max: variant },
    status: 'ready',
    legacy: false,
    usedBy: [],
    orphanedAt: null,
    uploadedAt: new Date('2026-11-12T00:00:00Z'),
    derivedFrom: 'A',
    transform: { rotate: 90, flip: false },
  };

  it('원본 ID와 변환을 읽어도 버리지 않는다(다시 돌릴 때 원본을 찾는다)', () => {
    const parsed = assetDocSchema.parse(derived);
    expect(parsed.derivedFrom).toBe('A');
    expect(parsed.transform).toEqual({ rotate: 90, flip: false });
  });

  it('두 칸이 없는 옛 자산 문서도 읽는다', () => {
    const plain: Record<string, unknown> = { ...derived };
    delete plain.derivedFrom;
    delete plain.transform;
    expect(assetDocSchema.safeParse(plain).success).toBe(true);
  });

  it('90° 단위가 아닌 회전은 받지 않는다', () => {
    expect(
      assetDocSchema.safeParse({ ...derived, transform: { rotate: 45, flip: false } }).success,
    ).toBe(false);
  });
});

describe('withDerivedRoots: 정리 직전 재검사', () => {
  it('쓰이는 파생 자산의 원본을 "쓰임"에 더한다', () => {
    const referenced = withDerivedRoots(
      new Set(['B']),
      new Map([
        ['B', 'A'],
        ['C', 'X'],
      ]),
    );
    expect([...referenced].sort()).toEqual(['A', 'B']);
  });

  it('쓰이지 않는 파생 자산의 원본은 더하지 않는다', () => {
    expect([...withDerivedRoots(new Set(['Z']), new Map([['C', 'X']]))]).toEqual(['Z']);
  });

  it('받은 집합을 바꾸지 않는다', () => {
    const referenced = new Set(['B']);
    withDerivedRoots(referenced, new Map([['B', 'A']]));
    expect([...referenced]).toEqual(['B']);
  });
});
