// 에디터 이미지 회전·좌우반전 테스트 (이미지 회전·좌우반전 작업)
// - 단추를 켤 이미지: 이 블로그 버킷의 새 자산(assets/{id}/…)만. 옛 CMS 이미지와 외부 이미지는 끈다(사용자 결정 2026-11-12).
// - 서버가 돌린 자산을 받으면 src만 바꾸고 이미지 노드 선택을 지킨다. 기다리는 동안 src가 바뀌었으면 바꾸지 않는다.
import { getSchema, type JSONContent } from '@tiptap/core';
import { EditorState, NodeSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { createEditorExtensions } from '@/editor/extensions';
import {
  imageTransformTargetOf,
  replaceImageSrcKeepingSelection,
} from '@/editor/ui/image-transform';

const BUCKET = 'cruz-lab.firebasestorage.app';
const firebaseUrl = (bucket: string, path: string) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=t`;

describe('imageTransformTargetOf: 단추를 켤 이미지', () => {
  it('새 자산의 최대 변형 주소면 자산 ID다', () => {
    expect(imageTransformTargetOf(firebaseUrl(BUCKET, 'assets/abc123/w2040.webp'), BUCKET)).toEqual(
      {
        kind: 'asset',
        assetId: 'abc123',
      },
    );
  });

  it('새 자산의 작은 변형 주소도 자산 ID다(옛 크기 버튼으로 넣은 초안)', () => {
    expect(imageTransformTargetOf(firebaseUrl(BUCKET, 'assets/abc123/w480.webp'), BUCKET)).toEqual({
      kind: 'asset',
      assetId: 'abc123',
    });
  });

  it('우리 버킷의 옛 CMS 이미지(images/…)는 legacy다', () => {
    expect(imageTransformTargetOf(firebaseUrl(BUCKET, 'images/old.jpg'), BUCKET)).toEqual({
      kind: 'legacy',
    });
  });

  it('다른 버킷과 외부 주소는 external이다', () => {
    expect(
      imageTransformTargetOf(firebaseUrl('other.appspot.com', 'assets/abc/w960.webp'), BUCKET),
    ).toEqual({
      kind: 'external',
    });
    expect(imageTransformTargetOf('https://example.com/a.png', BUCKET)).toEqual({
      kind: 'external',
    });
  });

  it('버킷 이름을 모르면 external이다', () => {
    expect(imageTransformTargetOf(firebaseUrl(BUCKET, 'assets/abc/w960.webp'), '')).toEqual({
      kind: 'external',
    });
  });
});

const schema = getSchema(createEditorExtensions());
const oldSrc = firebaseUrl(BUCKET, 'assets/A/w2040.webp');
const newSrc = firebaseUrl(BUCKET, 'assets/B/w1300.webp');

// "앞 글자" + 이미지 단락. 이미지 위치를 함께 준다
function stateWithImage(attrs: Record<string, unknown>) {
  const json: JSONContent = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: '앞 글자' }] },
      { type: 'paragraph', content: [{ type: 'image', attrs }] },
    ],
  };
  const doc = schema.nodeFromJSON(json);
  let pos = -1;
  doc.descendants((node, nodePos) => {
    if (node.type.name === 'image') pos = nodePos;
  });
  return { state: EditorState.create({ schema, doc }), pos };
}

describe('replaceImageSrcKeepingSelection', () => {
  it('src만 바꾸고 폭·정렬·대체·캡션과 노드 선택을 지킨다', () => {
    const { state, pos } = stateWithImage({
      src: oldSrc,
      alt: '그림',
      title: '캡션',
      width: 300,
      align: 'center',
    });
    const tr = state.tr;
    expect(replaceImageSrcKeepingSelection(tr, pos, oldSrc, newSrc)).toBe(true);
    const next = state.apply(tr);
    const image = next.doc.nodeAt(pos);
    expect(image?.attrs).toMatchObject({
      src: newSrc,
      alt: '그림',
      title: '캡션',
      width: 300,
      align: 'center',
    });
    expect(next.selection).toBeInstanceOf(NodeSelection);
    expect(next.selection.from).toBe(pos);
  });

  it('기다리는 동안 src가 바뀌었으면(다른 이미지로 바꿈, 되돌리기) 아무것도 바꾸지 않는다', () => {
    const { state, pos } = stateWithImage({ src: firebaseUrl(BUCKET, 'assets/C/w800.webp') });
    const tr = state.tr;
    expect(replaceImageSrcKeepingSelection(tr, pos, oldSrc, newSrc)).toBe(false);
    expect(tr.docChanged).toBe(false);
  });

  it('그 자리가 이미지가 아니면 아무것도 바꾸지 않는다', () => {
    const { state } = stateWithImage({ src: oldSrc });
    const tr = state.tr;
    // 1은 첫 단락 안의 글자 자리다
    expect(replaceImageSrcKeepingSelection(tr, 1, oldSrc, newSrc)).toBe(false);
    expect(replaceImageSrcKeepingSelection(tr, state.doc.content.size + 3, oldSrc, newSrc)).toBe(
      false,
    );
    expect(tr.docChanged).toBe(false);
  });

  it('되돌리기 한 번에 옛 src로 돌아갈 수 있게 한 단계로 바꾼다', () => {
    const { state, pos } = stateWithImage({ src: oldSrc });
    const tr = state.tr;
    replaceImageSrcKeepingSelection(tr, pos, oldSrc, newSrc);
    expect(tr.steps).toHaveLength(1);
  });
});
