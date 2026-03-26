import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorSelection } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExtension } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { indentUnit } from '@codemirror/language';
import { drawSelection, highlightActiveLine, highlightSpecialChars } from '@codemirror/view';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching } from '@codemirror/language';

import type { UploadStatus } from './upload-types';
import { UploadProgress } from './UploadProgress';
import './CodeMirrorEditor.css';

interface CodeMirrorEditorProps {
  defaultValue?: string;
  onChange?: (markdown: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  enableSlash?: boolean;
  showShortcutsHelp?: boolean;
  enableImageUpload?: boolean;
  onUploadError?: (error: Error) => void;
  onSave?: () => void;
  showImportButton?: boolean;
}

type ShortcutDefinition = {
  label: string;
  key: string;
};

const shortcutDefinitions: ShortcutDefinition[] = [
  { label: '빠른 삽입 패널', key: '⌘/Ctrl+Shift+P' },
  { label: '빈 줄에서 빠른 삽입', key: '/' },
  { label: '굵게', key: '⌘/Ctrl+B' },
  { label: '기울임', key: '⌘/Ctrl+I' },
  { label: '링크', key: '⌘/Ctrl+K' },
  { label: '제목 1', key: '⌘/Ctrl+Alt+1' },
  { label: '제목 2', key: '⌘/Ctrl+Alt+2' },
  { label: '제목 3', key: '⌘/Ctrl+Alt+3' },
  { label: '코드 블록', key: '⌘/Ctrl+Alt+C' },
  { label: '인용구', key: '⌘/Ctrl+Alt+Q' },
  { label: '체크리스트', key: '⌘/Ctrl+Alt+L' },
  { label: '저장', key: '⌘/Ctrl+S' },
];

type QuickInsertItem = {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  action: (view: EditorView) => void;
};

function insertAroundSelection(view: EditorView, before: string, after: string = before) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.doc.sliceString(from, to);
  const inserted = `${before}${selected}${after}`;
  const anchor = from + before.length;
  const head = anchor + selected.length;

  view.dispatch({
    changes: { from, to, insert: inserted },
    selection: { anchor, head },
    scrollIntoView: true,
  });
  view.focus();
}

function toggleHeading(view: EditorView, level: number) {
  const prefix = `${'#'.repeat(level)} `;
  const { from, to } = view.state.selection.main;
  const lineFrom = view.state.doc.lineAt(from);
  const lineTo = view.state.doc.lineAt(to);
  const changes: { from: number; to: number; insert: string }[] = [];

  for (let lineNumber = lineFrom.number; lineNumber <= lineTo.number; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const stripped = line.text.replace(/^#{1,6}\s+/, '');
    const nextLine = line.text.startsWith(prefix) ? stripped : `${prefix}${stripped}`;
    changes.push({ from: line.from, to: line.to, insert: nextLine });
  }

  view.dispatch({ changes, scrollIntoView: true });
  view.focus();
}

function insertTextAtSelection(
  view: EditorView,
  text: string,
  selection?: { anchorOffset: number; headOffset?: number }
) {
  const { from, to } = view.state.selection.main;
  const base = from;

  view.dispatch({
    changes: { from, to, insert: text },
    selection: selection
      ? EditorSelection.single(base + selection.anchorOffset, base + (selection.headOffset ?? selection.anchorOffset))
      : EditorSelection.cursor(base + text.length),
    scrollIntoView: true,
  });
  view.focus();
}

function prefixCurrentLines(view: EditorView, prefix: string) {
  const { from, to } = view.state.selection.main;
  const lineFrom = view.state.doc.lineAt(from);
  const lineTo = view.state.doc.lineAt(to);
  const changes: { from: number; insert: string }[] = [];

  for (let lineNumber = lineFrom.number; lineNumber <= lineTo.number; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    changes.push({ from: line.from, insert: prefix });
  }

  view.dispatch({ changes, scrollIntoView: true });
  view.focus();
}

function insertCodeBlock(view: EditorView) {
  insertTextAtSelection(view, '```ts\n\n```', { anchorOffset: 6 });
}

function insertTable(view: EditorView) {
  insertTextAtSelection(
    view,
    '| 항목 | 설명 |\n| --- | --- |\n|  |  |',
    { anchorOffset: 30, headOffset: 30 }
  );
}

function insertDivider(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const prefix = line.text.trim().length === 0 ? '' : '\n';
  const suffix = to === line.to ? '\n' : '';
  insertTextAtSelection(view, `${prefix}---${suffix}`, {
    anchorOffset: prefix.length + 3 + suffix.length,
  });
}

function createQuickInsertItems(): QuickInsertItem[] {
  return [
    {
      id: 'heading1',
      label: '제목 1',
      description: '현재 줄을 H1으로 바꾸거나 되돌립니다.',
      shortcut: '⌘/Ctrl+Alt+1',
      action: (view) => toggleHeading(view, 1),
    },
    {
      id: 'heading2',
      label: '제목 2',
      description: '현재 줄을 H2로 바꾸거나 되돌립니다.',
      shortcut: '⌘/Ctrl+Alt+2',
      action: (view) => toggleHeading(view, 2),
    },
    {
      id: 'heading3',
      label: '제목 3',
      description: '현재 줄을 H3로 바꾸거나 되돌립니다.',
      shortcut: '⌘/Ctrl+Alt+3',
      action: (view) => toggleHeading(view, 3),
    },
    {
      id: 'checklist',
      label: '체크리스트',
      description: '`- [ ]` 형식의 체크리스트를 추가합니다.',
      shortcut: '⌘/Ctrl+Alt+L',
      action: (view) => prefixCurrentLines(view, '- [ ] '),
    },
    {
      id: 'bullet-list',
      label: '글머리 목록',
      description: '`-` 글머리 목록을 추가합니다.',
      action: (view) => prefixCurrentLines(view, '- '),
    },
    {
      id: 'blockquote',
      label: '인용구',
      description: '현재 줄 앞에 `>`를 붙입니다.',
      shortcut: '⌘/Ctrl+Alt+Q',
      action: (view) => prefixCurrentLines(view, '> '),
    },
    {
      id: 'codeblock',
      label: '코드 블록',
      description: '언어가 포함된 fenced code block을 삽입합니다.',
      shortcut: '⌘/Ctrl+Alt+C',
      action: (view) => insertCodeBlock(view),
    },
    {
      id: 'table',
      label: '표',
      description: '2열 표 템플릿을 넣습니다.',
      action: (view) => insertTable(view),
    },
    {
      id: 'divider',
      label: '구분선',
      description: '`---` 구분선을 넣습니다.',
      action: (view) => insertDivider(view),
    },
  ];
}

function insertLink(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.doc.sliceString(from, to) || '링크 텍스트';
  const inserted = `[${selected}](https://)`;
  const urlStart = from + selected.length + 3;
  const urlEnd = urlStart + 'https://'.length;

  view.dispatch({
    changes: { from, to, insert: inserted },
    selection: EditorSelection.single(urlStart, urlEnd),
    scrollIntoView: true,
  });
  view.focus();
}

function fileNameToAlt(name: string) {
  return name.replace(/\.[^/.]+$/, '');
}

function createKeymap({
  onSave,
  onOpenQuickInsert,
}: {
  onSave?: () => void;
  onOpenQuickInsert: () => void;
}) {
  return keymap.of([
    {
      key: 'Mod-Shift-p',
      preventDefault: true,
      run: () => {
        onOpenQuickInsert();
        return true;
      },
    },
    {
      key: 'Mod-b',
      preventDefault: true,
      run: (view) => {
        insertAroundSelection(view, '**');
        return true;
      },
    },
    {
      key: 'Mod-i',
      preventDefault: true,
      run: (view) => {
        insertAroundSelection(view, '*');
        return true;
      },
    },
    {
      key: 'Mod-k',
      preventDefault: true,
      run: (view) => {
        insertLink(view);
        return true;
      },
    },
    {
      key: 'Mod-Alt-1',
      preventDefault: true,
      run: (view) => {
        toggleHeading(view, 1);
        return true;
      },
    },
    {
      key: 'Mod-Alt-2',
      preventDefault: true,
      run: (view) => {
        toggleHeading(view, 2);
        return true;
      },
    },
    {
      key: 'Mod-Alt-3',
      preventDefault: true,
      run: (view) => {
        toggleHeading(view, 3);
        return true;
      },
    },
    {
      key: 'Mod-s',
      preventDefault: true,
      run: () => {
        onSave?.();
        return true;
      },
    },
    {
      key: 'Mod-Alt-c',
      preventDefault: true,
      run: (view) => {
        insertCodeBlock(view);
        return true;
      },
    },
    {
      key: 'Mod-Alt-q',
      preventDefault: true,
      run: (view) => {
        prefixCurrentLines(view, '> ');
        return true;
      },
    },
    {
      key: 'Mod-Alt-l',
      preventDefault: true,
      run: (view) => {
        prefixCurrentLines(view, '- [ ] ');
        return true;
      },
    },
    {
      key: '/',
      run: (view) => {
        const { from } = view.state.selection.main;
        const line = view.state.doc.lineAt(from);
        const beforeCursor = view.state.doc.sliceString(line.from, from);
        const afterCursor = view.state.doc.sliceString(from, line.to);

        if (beforeCursor.trim().length === 0 && afterCursor.trim().length === 0) {
          onOpenQuickInsert();
          return true;
        }

        return false;
      },
    },
  ]);
}

export default function CodeMirrorEditor({
  defaultValue = '',
  onChange,
  readOnly = false,
  placeholder = '내용을 입력하세요...',
  className = '',
  showShortcutsHelp = true,
  enableImageUpload = true,
  onUploadError,
  onSave,
}: CodeMirrorEditorProps) {
  const [editorTheme, setEditorTheme] = useState<'dark' | 'light'>('dark');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showQuickInsert, setShowQuickInsert] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadFileName, setUploadFileName] = useState<string | undefined>();
  const [isDragOver, setIsDragOver] = useState(false);
  const viewRef = useRef<EditorView | null>(null);
  const quickInsertItems = useMemo(() => createQuickInsertItems(), []);

  useEffect(() => {
    const detectTheme = () => {
      const saved = localStorage.getItem('theme');
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? true;
      const isDark = saved ? saved === 'dark' : prefersDark;
      setEditorTheme(isDark ? 'dark' : 'light');
    };

    detectTheme();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'theme') detectTheme();
    };

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') detectTheme();
      });
    });

    window.addEventListener('storage', handleStorage);
    observer.observe(document.documentElement, { attributes: true });

    return () => {
      window.removeEventListener('storage', handleStorage);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!showShortcutsHelp) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.shiftKey && event.key.toLowerCase() === '/') {
        event.preventDefault();
        setShowShortcuts((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [showShortcutsHelp]);

  const handleUploadHide = useCallback(() => {
    setUploadStatus('idle');
    setUploadProgress(0);
    setUploadFileName(undefined);
  }, []);

  const insertMediaMarkdown = useCallback(
    async (file: File) => {
      if (!viewRef.current || !enableImageUpload) return;

      try {
        const { uploadImageToFirebase } = await import('./media-upload-client');
        const url = await uploadImageToFirebase(file, {
          onProgress: (progress, status, fileName) => {
            setUploadProgress(progress);
            setUploadStatus(status);
            setUploadFileName(fileName);
          },
          onError: (error) => {
            onUploadError?.(error);
          },
        });

        const alt = fileNameToAlt(file.name);
        const markdownText = `![${alt}](${url})`;
        const view = viewRef.current;
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: markdownText },
          selection: EditorSelection.cursor(from + markdownText.length),
          scrollIntoView: true,
        });
        view.focus();
      } catch (error) {
        onUploadError?.(error as Error);
      }
    },
    [enableImageUpload, onUploadError]
  );

  const uploadHandlers = useMemo<Extension>(
    () =>
      EditorView.domEventHandlers({
        drop: (event) => {
          const file = event.dataTransfer?.files?.[0];
          if (!file || !file.type.startsWith('image/')) {
            setIsDragOver(false);
            return false;
          }

          event.preventDefault();
          setIsDragOver(false);
          void insertMediaMarkdown(file);
          return true;
        },
        dragenter: (event) => {
          if (event.dataTransfer?.types.includes('Files')) {
            setIsDragOver(true);
          }
          return false;
        },
        dragleave: () => {
          setIsDragOver(false);
          return false;
        },
        paste: (event) => {
          const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
            item.type.startsWith('image/')
          );

          if (!file) return false;

          event.preventDefault();
          void insertMediaMarkdown(file);
          return true;
        },
      }),
    [insertMediaMarkdown]
  );

  const extensions = useMemo<Extension[]>(
    () => [
      drawSelection(),
      highlightActiveLine(),
      highlightSpecialChars(),
      indentOnInput(),
      bracketMatching(),
      indentUnit.of('  '),
      markdown({ addKeymap: true }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      EditorView.lineWrapping,
      placeholderExtension(placeholder),
      EditorView.editable.of(!readOnly),
      createKeymap({
        onSave,
        onOpenQuickInsert: () => setShowQuickInsert(true),
      }),
      uploadHandlers,
      EditorView.theme({
        '&': {
          height: '100%',
        },
      }),
    ],
    [onSave, placeholder, readOnly, uploadHandlers]
  );

  const handleQuickInsert = useCallback((item: QuickInsertItem) => {
    if (!viewRef.current) return;

    item.action(viewRef.current);
    setShowQuickInsert(false);
  }, []);

  return (
    <div
      className={`codemirror-editor-wrapper ${className}`.trim()}
      data-theme={editorTheme}
      data-readonly={readOnly}
    >
      <div className="editor-floating-buttons">
        <button
          type="button"
          className="quick-insert-trigger"
          onClick={() => setShowQuickInsert(true)}
          title="빠른 삽입 패널 열기"
          aria-label="빠른 삽입 패널 열기"
        >
          <span className="quick-insert-trigger-icon">+</span>
        </button>
        {showShortcutsHelp && (
          <button
            type="button"
            className="keyboard-shortcuts-trigger"
            onClick={() => setShowShortcuts(true)}
            title="키보드 단축키 보기"
            aria-label="키보드 단축키 보기"
          >
            <span className="keyboard-shortcuts-trigger-icon">⌨</span>
          </button>
        )}
      </div>

      <div className={`codemirror-editor-shell ${isDragOver ? 'drag-over' : ''}`}>
        <CodeMirror
          value={defaultValue}
          height="100%"
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLineGutter: false,
            autocompletion: false,
            searchKeymap: true,
          }}
          extensions={extensions}
          editable={!readOnly}
          onCreateEditor={(view) => {
            viewRef.current = view;
          }}
          onUpdate={(update: ViewUpdate) => {
            if (update.docChanged) {
              onChange?.(update.state.doc.toString());
            }
          }}
        />
      </div>

      <UploadProgress
        progress={uploadProgress}
        status={uploadStatus}
        fileName={uploadFileName}
        onHide={handleUploadHide}
      />

      {showQuickInsert && (
        <div
          className="quick-insert-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowQuickInsert(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-insert-title"
        >
          <div className="quick-insert-panel">
            <div className="quick-insert-header">
              <div>
                <h2 id="quick-insert-title" className="quick-insert-title">
                  빠른 삽입
                </h2>
                <p className="quick-insert-subtitle">
                  자주 쓰는 블록을 한 번에 넣습니다.
                </p>
              </div>
              <button
                type="button"
                className="quick-insert-close"
                onClick={() => setShowQuickInsert(false)}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="quick-insert-grid">
              {quickInsertItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="quick-insert-item"
                  onClick={() => handleQuickInsert(item)}
                >
                  <div className="quick-insert-item-header">
                    <span className="quick-insert-item-label">{item.label}</span>
                    {item.shortcut && (
                      <kbd className="quick-insert-item-key">{item.shortcut}</kbd>
                    )}
                  </div>
                  <span className="quick-insert-item-description">{item.description}</span>
                </button>
              ))}
            </div>
            <div className="quick-insert-footer">
              <span className="quick-insert-hint">
                빈 줄에서 `/` 또는 `⌘/Ctrl+Shift+P`로 열 수 있습니다.
              </span>
            </div>
          </div>
        </div>
      )}

      {showShortcuts && (
        <div
          className="keyboard-shortcuts-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowShortcuts(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="codemirror-shortcuts-title"
        >
          <div className="keyboard-shortcuts-modal">
            <div className="keyboard-shortcuts-header">
              <h2 id="codemirror-shortcuts-title" className="keyboard-shortcuts-title">
                키보드 단축키
              </h2>
              <button
                type="button"
                className="keyboard-shortcuts-close"
                onClick={() => setShowShortcuts(false)}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="keyboard-shortcuts-content">
              <div className="keyboard-shortcuts-group">
                <ul className="keyboard-shortcuts-list">
                  {shortcutDefinitions.map((shortcut) => (
                    <li key={shortcut.label} className="keyboard-shortcuts-item">
                      <span className="keyboard-shortcuts-label">{shortcut.label}</span>
                      <kbd className="keyboard-shortcuts-key">{shortcut.key}</kbd>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="keyboard-shortcuts-footer">
              <span className="keyboard-shortcuts-hint">⌘/Ctrl+Shift+/ 로 이 도움말 열기</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
