// 에디터 확장 묶음 = 스키마 (재건 3단계 D10, Plan 4.1)
// - createEditorExtensions()가 돌려주는 배열이 곧 문서 스키마다. 변환기 테스트와 왕복 검사가 getSchema()로 같은 스키마를 만든다.
// - 여기에는 DOM·React가 필요한 것(노드 뷰, 메뉴, 슬래시)을 두지 않는다. 그것은 T3·T5의 ui·commands가 더한다.
// - 모든 @tiptap/* 패키지는 3.33.0으로 고정한다(peer 요구).

import type { Extensions } from '@tiptap/core';
import { Code } from '@tiptap/extension-code';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { Image } from '@tiptap/extension-image';
import { BulletList, OrderedList, TaskItem, TaskList } from '@tiptap/extension-list';
import { Mathematics } from '@tiptap/extension-mathematics';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { StarterKit } from '@tiptap/starter-kit';
import { normalizeImageAlign, normalizeImageWidth } from '../markdown/image-html.ts';
import { Callout } from './callout.ts';
import { Embed } from './embed.ts';
import { lowlight } from './lowlight.ts';

// 목록의 느슨함(mdast spread). 렌더에 영향을 주므로(항목이 <p>로 감싸인다) 보존한다. DOM에는 쓰지 않는다
const spreadAttribute = { spread: { default: false, rendered: false } };

// 인라인 코드: 기본값은 다른 마크를 모두 밀어내지만(excludes '_'), 기존 글의 **`코드`**를 지키려면 굵게·링크와 겹쳐야 한다.
// keepOnSplit false: 인라인 코드 끝에서 Enter를 누르면 새 줄은 인라인 코드가 아니다(사용 피드백 2026-11-09).
// 스키마는 바뀌지 않는다(Tiptap의 splitBlock·splitListItem이 새 줄에 넘길 마크를 고를 때만 읽는다)
export const EditorCode = Code.extend({ excludes: 'code', keepOnSplit: false });

export const EditorBulletList = BulletList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...spreadAttribute };
  },
});

export const EditorOrderedList = OrderedList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...spreadAttribute };
  },
});

// 코드 블록: 언어 뒤의 meta(```c title="x")를 보존한다
export const EditorCodeBlock = CodeBlockLowlight.extend({
  addAttributes() {
    return { ...this.parent?.(), meta: { default: null, rendered: false } };
  },
}).configure({ lowlight, defaultLanguage: null });

// 표 셀: 마크다운 표 셀은 단락 하나다
export const EditorTableCell = TableCell.extend({ content: 'paragraph' });
export const EditorTableHeader = TableHeader.extend({ content: 'paragraph' });

// 이미지: 단락 안 인라인 노드(D10). 업로드 상태 속성 3개는 DOM·마크다운에 쓰지 않는다(D11 3·7).
// - uploadId가 있는 동안은 src가 blob: 주소다. EditorApp은 이 노드가 있으면 자동저장을 멈춘다.
// - 노드 뷰(React)는 ui/editor-extensions.ts가 extend로 더한다. 여기는 DOM 없이 돈다.
// - 폭·정렬(5단계 D13): width는 정수 px(16~4096), align은 center·right(왼쪽은 null)다.
//   HTML에는 data-width·data-align으로 쓰고 읽는다. 에디터 안 복사·붙여넣기가 HTML을 거치므로 둘 다 있어야 잃지 않는다.
//   바깥 HTML의 width는 읽지 않는다. 공개 글(rehype-assets가 모든 새 자산 이미지에 width를 붙인다)이나 웹 페이지를
//   복사해 붙이면 사용자가 정하지 않은 폭이 원시 HTML로 저장되기 때문이다(리뷰 S2).
export const EditorImageNode = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // Tiptap 기본 width(바깥 HTML의 width를 읽는다)를 덮는다. 에디터 표지 data-width만 숫자로 읽는다
      width: {
        default: null,
        parseHTML: (element) => normalizeImageWidth(element.getAttribute('data-width')),
        renderHTML: (attributes) => {
          const width = normalizeImageWidth(attributes.width);
          return width === null ? {} : { 'data-width': String(width) };
        },
      },
      align: {
        default: null,
        parseHTML: (element) => normalizeImageAlign(element.getAttribute('data-align')),
        renderHTML: (attributes) => {
          const align = normalizeImageAlign(attributes.align);
          return align === null ? {} : { 'data-align': align };
        },
      },
      uploadId: { default: null, rendered: false },
      uploadProgress: { default: null, rendered: false },
      uploadError: { default: null, rendered: false },
    };
  },
});
// extend() 뒤에는 옵션이 기본값으로 돌아가므로 UI 쪽도 같은 옵션으로 다시 configure한다
export const IMAGE_OPTIONS = { inline: true, allowBase64: false } as const;
export const EditorImage = EditorImageNode.configure(IMAGE_OPTIONS);

// 에디터 스키마를 이루는 확장 배열
export function createEditorExtensions(): Extensions {
  return [
    StarterKit.configure({
      // 아래에서 바꿔 넣는 것은 끈다
      code: false,
      codeBlock: false,
      bulletList: false,
      orderedList: false,
      // 마크다운에 없는 마크는 두지 않는다
      underline: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { openOnClick: false, autolink: true, linkOnPaste: true },
    }),
    EditorCode,
    EditorBulletList,
    EditorOrderedList,
    EditorCodeBlock,
    TaskList,
    TaskItem.configure({ nested: true }),
    Table,
    TableRow,
    EditorTableHeader,
    EditorTableCell,
    EditorImage,
    Callout,
    Embed,
    Mathematics,
  ];
}
