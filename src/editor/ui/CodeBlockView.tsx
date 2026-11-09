// 코드 블록 노드 뷰: 언어 선택 드롭다운 (재건 3단계 D10)
// - 목록은 extensions/lowlight.ts의 CODE_LANGUAGES(20종)다. 목록에 없는 기존 값(예: js)도 그대로 보이고 고를 수 있다.
// - 언어를 바꾸면 노드의 language 속성만 바꾼다(마크다운 ```lang). 하이라이트는 lowlight 장식이 그대로 맡는다.

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { CODE_LANGUAGES } from '@/editor/extensions/lowlight';

export function CodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const language = typeof node.attrs.language === 'string' ? node.attrs.language : '';
  const known = CODE_LANGUAGES.some((item) => item.value === language);
  return (
    <NodeViewWrapper className="editor-code-block">
      <select
        contentEditable={false}
        className="editor-code-language"
        value={language}
        disabled={!editor.isEditable}
        aria-label="코드 언어"
        onChange={(event) => updateAttributes({ language: event.target.value || null })}
      >
        <option value="">언어 없음</option>
        {language && !known && <option value={language}>{language}</option>}
        {CODE_LANGUAGES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <pre>
        <NodeViewContent<'code'>
          as="code"
          className={language ? `language-${language}` : undefined}
        />
      </pre>
    </NodeViewWrapper>
  );
}
