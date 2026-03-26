import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorSelection } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExtension } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { indentUnit } from '@codemirror/language';
import { drawSelection, highlightActiveLine, highlightSpecialChars } from '@codemirror/view';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching } from '@codemirror/language';

import { uploadImageToFirebase, type UploadStatus } from './plugins/imageUpload';
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
  { label: '굵게', key: '⌘/Ctrl+B' },
  { label: '기울임', key: '⌘/Ctrl+I' },
  { label: '링크', key: '⌘/Ctrl+K' },
  { label: '제목 1', key: '⌘/Ctrl+Alt+1' },
  { label: '제목 2', key: '⌘/Ctrl+Alt+2' },
  { label: '제목 3', key: '⌘/Ctrl+Alt+3' },
  { label: '저장', key: '⌘/Ctrl+S' },
];

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

function createKeymap(onSave?: () => void) {
  return keymap.of([
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadFileName, setUploadFileName] = useState<string | undefined>();
  const [isDragOver, setIsDragOver] = useState(false);
  const viewRef = useRef<EditorView | null>(null);

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
      markdown({ codeLanguages: languages, addKeymap: true }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      EditorView.lineWrapping,
      placeholderExtension(placeholder),
      EditorView.editable.of(!readOnly),
      createKeymap(onSave),
      uploadHandlers,
      EditorView.theme({
        '&': {
          height: '100%',
        },
      }),
    ],
    [onSave, placeholder, readOnly, uploadHandlers]
  );

  return (
    <div
      className={`codemirror-editor-wrapper ${className}`.trim()}
      data-theme={editorTheme}
      data-readonly={readOnly}
    >
      <div className="editor-floating-buttons">
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
