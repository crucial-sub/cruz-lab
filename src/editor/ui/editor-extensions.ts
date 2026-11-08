// 화면용 확장 묶음 (재건 3단계 T3·T4)
// - 스키마(createEditorExtensions)에 DOM·React가 필요한 것만 더한다: 이미지 노드 뷰, 파일 드롭·붙여넣기 업로드, 자리표시 문구.
// - 스키마 자체는 바꾸지 않는다. 변환기·왕복 검사와 같은 문서 구조다.

import type { Extensions } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { createEditorExtensions, EditorImageNode, IMAGE_OPTIONS } from '@/editor/extensions';
import { ImageUpload, type ImageUploadOptions } from '@/editor/upload/paste-drop';
import { ImageNodeView } from './ImageNodeView';

// 이미지 노드에 React 노드 뷰를 붙인다(업로드 진행률·재시도, 대체 텍스트·캡션·크기 메뉴)
const EditorImageWithView = EditorImageNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView, { contentDOMElementTag: 'span' });
  },
}).configure(IMAGE_OPTIONS);

export function createUiExtensions(upload: ImageUploadOptions): Extensions {
  const base = createEditorExtensions().filter((extension) => extension.name !== 'image');
  return [
    ...base,
    EditorImageWithView,
    ImageUpload.configure(upload),
    Placeholder.configure({
      placeholder: '본문을 쓰세요. 이미지는 끌어다 놓거나 붙여넣으세요.',
      showOnlyWhenEditable: true,
    }),
  ];
}
