/**
 * 코드블록 언어 선택기 플러그인
 *
 * 노션 스타일: 코드블록 우측 상단에 작은 드롭다운으로 언어 선택
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model';
import type { EditorView, NodeView, ViewMutationRecord } from '@milkdown/kit/prose/view';

/**
 * 지원하는 언어 목록
 */
export const SUPPORTED_LANGUAGES = [
  { value: '', label: 'Plain Text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'jsx', label: 'JSX' },
  { value: 'tsx', label: 'TSX' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'xml', label: 'XML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'shell', label: 'Shell' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'graphql', label: 'GraphQL' },
] as const;

/**
 * 언어 값에서 표시 라벨 찾기
 */
function getLangLabel(value: string): string {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.value === value);
  return lang?.label || value || 'Plain Text';
}

/**
 * 코드블록 NodeView 클래스 (노션 스타일)
 */
class CodeBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private select: HTMLSelectElement;
  private langButton: HTMLButtonElement;
  private dropdown: HTMLElement;
  private view: EditorView;
  private getPos: () => number | undefined;
  private currentNode: ProseMirrorNode;

  constructor(node: ProseMirrorNode, view: EditorView, getPos: () => number | undefined) {
    this.view = view;
    this.getPos = getPos;
    this.currentNode = node;

    // 컨테이너 생성 (position: relative)
    this.dom = document.createElement('div');
    this.dom.className = 'code-block-wrapper';

    // 현재 언어
    const currentLang = (node.attrs.language as string) || '';

    // 언어 선택 버튼 (우측 상단)
    this.langButton = document.createElement('button');
    this.langButton.className = 'code-block-lang-btn';
    this.langButton.type = 'button';
    this.langButton.textContent = getLangLabel(currentLang);
    this.langButton.title = '언어 선택';

    // 드롭다운 메뉴
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'code-block-dropdown';
    this.dropdown.style.display = 'none';

    // 언어 선택 (드롭다운 내부)
    this.select = document.createElement('select');
    this.select.className = 'code-block-lang-select';

    SUPPORTED_LANGUAGES.forEach((lang) => {
      const option = document.createElement('option');
      option.value = lang.value;
      option.textContent = lang.label;
      this.select.appendChild(option);
    });
    this.select.value = currentLang;

    this.dropdown.appendChild(this.select);

    // 버튼 클릭 시 드롭다운 토글
    this.langButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = this.dropdown.style.display !== 'none';
      this.dropdown.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) {
        this.select.focus();
      }
    });

    // 언어 변경 이벤트
    this.select.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      const pos = this.getPos();
      if (pos === undefined) return;

      const { tr } = this.view.state;
      tr.setNodeMarkup(pos, undefined, {
        ...this.currentNode.attrs,
        language: target.value,
      });
      this.view.dispatch(tr);

      // 버튼 텍스트 업데이트
      this.langButton.textContent = getLangLabel(target.value);

      // 드롭다운 닫기
      this.dropdown.style.display = 'none';

      // 에디터에 포커스
      this.view.focus();
    });

    // 드롭다운 외부 클릭 시 닫기
    this.select.addEventListener('blur', () => {
      setTimeout(() => {
        this.dropdown.style.display = 'none';
      }, 150);
    });

    // 코드 영역 (pre > code)
    const pre = document.createElement('pre');
    pre.className = `language-${currentLang || 'text'}`;

    const code = document.createElement('code');
    code.className = `language-${currentLang || 'text'}`;

    pre.appendChild(code);

    // DOM 구조: wrapper > (langButton, dropdown, pre)
    this.dom.appendChild(this.langButton);
    this.dom.appendChild(this.dropdown);
    this.dom.appendChild(pre);

    // contentDOM은 code 요소
    this.contentDOM = code;
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type.name !== 'code_block') return false;
    this.currentNode = node;

    // 언어 업데이트
    const lang = (node.attrs.language as string) || '';
    if (this.select.value !== lang) {
      this.select.value = lang;
      this.langButton.textContent = getLangLabel(lang);
    }

    // 클래스 업데이트
    const pre = this.dom.querySelector('pre');
    const code = this.dom.querySelector('code');
    if (pre && code) {
      pre.className = `language-${lang || 'text'}`;
      code.className = `language-${lang || 'text'}`;
    }

    return true;
  }

  selectNode(): void {
    this.dom.classList.add('ProseMirror-selectednode');
  }

  deselectNode(): void {
    this.dom.classList.remove('ProseMirror-selectednode');
  }

  stopEvent(event: Event): boolean {
    // select, button, dropdown 관련 이벤트는 에디터가 처리하지 않음
    const target = event.target as HTMLElement;
    if (
      target === this.select ||
      target === this.langButton ||
      this.dropdown.contains(target)
    ) {
      return true;
    }
    return false;
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    if (mutation.type === 'selection') {
      return false;
    }
    const target = mutation.target as globalThis.Node;
    if (
      target === this.select ||
      target === this.langButton ||
      target === this.dropdown ||
      this.dropdown.contains(target)
    ) {
      return true;
    }
    return false;
  }
}

/**
 * 코드블록 언어 선택기 플러그인
 */
export const codeBlockLanguagePlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey('cruz-code-block-language'),
    props: {
      nodeViews: {
        code_block: (node, view, getPos) => {
          return new CodeBlockView(node, view, getPos as () => number | undefined);
        },
      },
    },
  });
});

export default codeBlockLanguagePlugin;
