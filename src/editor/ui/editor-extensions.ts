// 화면용 확장 묶음 (재건 3단계 T3·T4·T5)
// - 스키마(createEditorExtensions)에 DOM·React가 필요한 것과 편집 동작을 더한다.
//   노드 뷰(이미지, 코드 블록 언어 선택, 임베드 iframe), 수식 클릭 편집, 파일 드롭·붙여넣기 업로드,
//   더한 입력 규칙·임베드 붙여넣기, 레지스트리 단축키, 슬래시 메뉴, 자리표시 문구.
// - 스키마 자체는 바꾸지 않는다. 노드 뷰를 붙인 확장은 같은 자리에서 바꿔 끼운다(노드 순서가 스키마와 같다).
// - Tiptap 확장이 스스로 거는 명령 키는 뺀다(stripCommandKeys). 키는 레지스트리에서만 나온다(D9).

import type { AnyExtension, Editor, Extensions } from '@tiptap/core';
import { Mathematics } from '@tiptap/extension-mathematics';
import { Placeholder } from '@tiptap/extensions';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { Platform } from '@/editor/commands/keymap';
import type { EditorCommand, MathTarget } from '@/editor/commands/registry';
import { RegistryShortcuts, stripCommandKeys } from '@/editor/commands/shortcuts';
import { SlashCommand } from '@/editor/commands/slash';
import {
  createEditorExtensions,
  EditorCodeBlock,
  EditorImageNode,
  IMAGE_OPTIONS,
} from '@/editor/extensions';
import { Embed } from '@/editor/extensions/embed';
import { EditorInputRules } from '@/editor/extensions/input-rules';
import { ImageUpload, type ImageUploadOptions } from '@/editor/upload/paste-drop';
import { CodeBlockView } from './CodeBlockView';
import { EmbedNodeView } from './EmbedNodeView';
import { ImageNodeView } from './ImageNodeView';

// 이미지 노드에 React 노드 뷰를 붙인다(업로드 진행률·재시도, 대체 텍스트·캡션·크기 메뉴)
const EditorImageWithView = EditorImageNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView, { contentDOMElementTag: 'span' });
  },
}).configure(IMAGE_OPTIONS);

// 코드 블록에 언어 선택 노드 뷰를 붙인다. configure한 옵션(lowlight)은 extend 뒤에도 남는다
const CodeBlockWithView = EditorCodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});

// 임베드에 iframe 노드 뷰를 붙인다
const EmbedWithView = Embed.extend({
  addNodeView() {
    return ReactNodeViewRenderer(EmbedNodeView);
  },
});

export interface UiExtensionOptions {
  upload: ImageUploadOptions;
  getCommands: () => readonly EditorCommand[];
  getRecent: () => readonly string[];
  // 슬래시 메뉴에서 고른 명령을 실행한다(최근 사용 기록 포함)
  onSlashRun: (command: EditorCommand, editor: Editor) => void;
  platform: Platform;
  // 빈 단락의 `$$` 입력 → 수식 블록 입력 창
  onMathBlockRequest: () => void;
  // 수식 노드를 누르면 고치는 창을 연다
  onMathClick: (target: MathTarget) => void;
}

export function createUiExtensions(options: UiExtensionOptions): Extensions {
  // 수식: 누르면 고치는 창을 연다. KaTeX 오류는 글자로 그린다
  const MathematicsWithEdit = Mathematics.configure({
    katexOptions: { throwOnError: false },
    blockOptions: {
      onClick: (node, pos) =>
        options.onMathClick({ kind: 'block', pos, latex: String(node.attrs.latex ?? '') }),
    },
    inlineOptions: {
      onClick: (node, pos) =>
        options.onMathClick({ kind: 'inline', pos, latex: String(node.attrs.latex ?? '') }),
    },
  });

  // 스키마의 확장을 같은 자리에서 화면용으로 바꿔 끼운다
  const replacements: Record<string, AnyExtension> = {
    image: EditorImageWithView,
    codeBlock: CodeBlockWithView,
    embed: EmbedWithView,
    Mathematics: MathematicsWithEdit,
  };
  const base = createEditorExtensions().map((extension) =>
    stripCommandKeys(replacements[extension.name] ?? extension),
  );

  return [
    ...base,
    ImageUpload.configure(options.upload),
    EditorInputRules.configure({ onMathBlockRequest: options.onMathBlockRequest }),
    RegistryShortcuts.configure({ getCommands: options.getCommands, platform: options.platform }),
    SlashCommand.configure({
      getCommands: options.getCommands,
      getRecent: options.getRecent,
      onRun: options.onSlashRun,
      platform: options.platform,
    }),
    Placeholder.configure({
      placeholder: '본문을 쓰세요. / 로 명령, 이미지는 끌어다 놓거나 붙여넣으세요.',
      showOnlyWhenEditable: true,
    }),
  ];
}
