/**
 * MilkdownEditor - Obsidian 스타일 마크다운 에디터
 *
 * Milkdown 기반 WYSIWYG 에디터로 Live Preview 모드를 지원합니다.
 * - commonmark: 기본 마크다운 문법 지원
 * - gfm: GitHub Flavored Markdown 확장
 * - history: 실행 취소/다시 실행 기능
 * - listener: 마크다운 변경 감지
 * - slash: / 명령어 메뉴
 * - keyboard shortcuts: 키보드 단축키 (Cmd/Ctrl+B, I, 1-3 등)
 * - image upload: 이미지 드래그 앤 드롭/붙여넣기 업로드
 * - prism: 코드 블록 구문 강조
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, parserCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { SlashProvider } from '@milkdown/kit/plugin/slash';
import { nord } from '@milkdown/theme-nord';
import type { Ctx } from '@milkdown/kit/ctx';
// @milkdown/theme-nord/style.css는 @layer base 충돌로 사용 불가
// 대신 커스텀 베이스 스타일 사용
import './styles/milkdown-base.css';
import './MilkdownEditor.css';

// Slash 플러그인 및 메뉴 컴포넌트
import { slash, defaultSlashItems } from './plugins/slashPlugin';
import type { SlashMenuItem } from './plugins/slashPlugin';
import { SlashMenu } from './SlashMenu';

// 키보드 단축키 플러그인 및 도움말 컴포넌트
import { keyboardShortcutsPlugin } from './plugins/keyboardShortcuts';
import { KeyboardShortcutsButton } from './KeyboardShortcutsHelp';

// 이미지 업로드 플러그인 및 진행률 컴포넌트
import {
  imageUploadPlugin,
  configureImageUpload,
  type UploadStatus,
} from './plugins/imageUpload';
import { UploadProgress } from './UploadProgress';

// Prism 코드 하이라이팅 플러그인
import { prismHighlightPlugin } from './plugins/prismPlugin';
import './styles/prism-theme.css';

// 코드블록 언어 선택기 플러그인
import { codeBlockLanguagePlugin } from './plugins/codeBlockPlugin';

// 인용구 탈출 플러그인
import { blockquoteEscapePlugin } from './plugins/blockquoteEscape';

// 코드블록 탈출 및 삭제 플러그인
import { codeBlockEscapePlugin } from './plugins/codeBlockEscape';

// 링크 다이얼로그 컴포넌트
import { LinkDialog } from './LinkDialog';

interface MilkdownEditorProps {
  /** 에디터 초기 마크다운 값 */
  defaultValue?: string;
  /** 마크다운 변경 시 호출되는 콜백 */
  onChange?: (markdown: string) => void;
  /** 읽기 전용 모드 */
  readOnly?: boolean;
  /** 플레이스홀더 텍스트 */
  placeholder?: string;
  /** 추가 CSS 클래스명 */
  className?: string;
  /** Slash 메뉴 활성화 여부 */
  enableSlash?: boolean;
  /** 키보드 단축키 도움말 버튼 표시 여부 */
  showShortcutsHelp?: boolean;
  /** 이미지 업로드 활성화 여부 */
  enableImageUpload?: boolean;
  /** 이미지 업로드 에러 콜백 */
  onUploadError?: (error: Error) => void;
  /** Cmd/Ctrl+S 저장 단축키 콜백 */
  onSave?: () => void;
  /** 마크다운 Import 버튼 표시 여부 */
  showImportButton?: boolean;
}

/**
 * Milkdown 에디터 컴포넌트
 *
 * @example
 * ```tsx
 * <MilkdownEditor
 *   defaultValue="# Hello World"
 *   onChange={(markdown) => console.log(markdown)}
 * />
 * ```
 */
export function MilkdownEditor({
  defaultValue = '',
  onChange,
  readOnly = false,
  placeholder = '내용을 입력하세요...',
  className = '',
  enableSlash = true,
  showShortcutsHelp = true,
  enableImageUpload = true,
  onUploadError,
  onSave,
  showImportButton = true,
}: MilkdownEditorProps) {
  // 에디터 DOM 참조
  const editorRef = useRef<HTMLDivElement>(null);
  // 에디터 인스턴스 참조
  const editorInstanceRef = useRef<Editor | null>(null);
  // 에디터 컨텍스트 참조
  const ctxRef = useRef<Ctx | null>(null);
  // onChange 콜백 참조 (재생성 방지)
  const onChangeRef = useRef(onChange);
  // onSave 콜백 참조 (재생성 방지)
  const onSaveRef = useRef(onSave);
  // Slash Provider 참조
  const slashProviderRef = useRef<SlashProvider | null>(null);
  // 초기값 참조 (재초기화 방지)
  const initialValueRef = useRef(defaultValue);

  // 테마 상태 (기본값: 사이트 테마 따름)
  const [editorTheme, setEditorTheme] = useState<'dark' | 'light'>('dark');

  // Slash 메뉴 상태
  const [slashMenuVisible, setSlashMenuVisible] = useState(false);
  const [slashMenuPosition, setSlashMenuPosition] = useState({ x: 0, y: 0 });
  const [slashFilter, setSlashFilter] = useState('');

  // 이미지 업로드 상태
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadFileName, setUploadFileName] = useState<string | undefined>();
  const [isDragOver, setIsDragOver] = useState(false);

  // 마크다운 Import용 파일 input 참조
  const importInputRef = useRef<HTMLInputElement>(null);

  // 링크 다이얼로그 상태
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDialogText, setLinkDialogText] = useState('');

  // 사이트 테마 감지 및 동기화
  useEffect(() => {
    const detectTheme = () => {
      // localStorage에서 직접 테마 읽기 (ThemeToggle과 동일한 방식)
      const saved = localStorage.getItem('theme');
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? true;
      const isDark = saved ? saved === 'dark' : prefersDark;
      setEditorTheme(isDark ? 'dark' : 'light');
    };

    // 초기 테마 감지
    detectTheme();

    // localStorage 변경 감지 (다른 탭에서 변경 시)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'theme') {
        detectTheme();
      }
    };
    window.addEventListener('storage', handleStorage);

    // MutationObserver로 html 클래스 변경 감지 (같은 탭에서 변경 시)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          detectTheme();
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => {
      window.removeEventListener('storage', handleStorage);
      observer.disconnect();
    };
  }, []);

  // 테마 토글 핸들러
  const handleThemeToggle = useCallback(() => {
    setEditorTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // onChange 참조 업데이트
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // onSave 참조 업데이트
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // 디바운스된 onChange 핸들러
  // Milkdown serializer가 특정 상황에서 **를 \*\*로 이스케이프하는 문제 해결
  const debouncedOnChange = useCallback((markdown: string) => {
    if (onChangeRef.current) {
      // 이스케이프된 볼드 마크다운 복원: \*\*text\*\* → **text**
      // Milkdown이 한글 뒤에서 **를 \*\*로 이스케이프하는 문제 해결
      const cleaned = markdown
        .replace(/\\(\*\*)/g, '$1')  // \** → ** (볼드 시작/끝)
        .replace(/\\_/g, '_');       // \_ → _
      onChangeRef.current(cleaned);
    }
  }, []);

  // Slash 메뉴 아이템 선택 핸들러
  const handleSlashSelect = useCallback((item: SlashMenuItem) => {
    if (ctxRef.current) {
      item.action(ctxRef.current);
    }
    setSlashMenuVisible(false);
    setSlashFilter('');
  }, []);

  // Slash 메뉴 닫기 핸들러
  const handleSlashClose = useCallback(() => {
    setSlashMenuVisible(false);
    setSlashFilter('');
  }, []);

  // 업로드 진행률 콜백
  const handleUploadProgress = useCallback(
    (progress: number, status: UploadStatus, fileName?: string) => {
      setUploadProgress(progress);
      setUploadStatus(status);
      setUploadFileName(fileName);
    },
    []
  );

  // 업로드 진행률 숨김 핸들러
  const handleUploadHide = useCallback(() => {
    setUploadStatus('idle');
    setUploadProgress(0);
    setUploadFileName(undefined);
  }, []);

  // 드래그 앤 드롭 핸들러
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 자식 요소로 이동하는 경우 무시
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    // 실제 파일 처리는 Milkdown upload 플러그인이 담당
  }, []);

  // 마크다운 Import 핸들러 - 파일 선택 시 에디터에 내용 설정
  const handleImportMarkdown = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ctxRef.current) return;

    try {
      // 파일 내용 읽기
      const text = await file.text();

      // 에디터 컨텍스트에서 파서와 뷰 가져오기
      const ctx = ctxRef.current;
      const parser = ctx.get(parserCtx);
      const view = ctx.get(editorViewCtx);

      // 마크다운을 ProseMirror 노드로 파싱
      const doc = parser(text);

      // 전체 문서 교체
      const { state, dispatch } = view;
      const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content);
      dispatch(tr);

      // 포커스
      view.focus();
    } catch (err) {
      console.error('마크다운 Import 오류:', err);
    }

    // 파일 input 리셋 (같은 파일 재선택 가능하도록)
    e.target.value = '';
  }, []);

  // Import 버튼 클릭 핸들러
  const handleImportClick = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  // 링크 다이얼로그 열기 핸들러
  const handleOpenLinkDialog = useCallback(() => {
    // 현재 선택된 텍스트 가져오기
    if (!ctxRef.current) {
      setLinkDialogText('');
      setLinkDialogOpen(true);
      return;
    }

    try {
      const view = ctxRef.current.get(editorViewCtx);
      const { state } = view;
      const { selection } = state;
      const selectedText = state.doc.textBetween(selection.from, selection.to, ' ');
      setLinkDialogText(selectedText || '');
    } catch {
      setLinkDialogText('');
    }

    setLinkDialogOpen(true);
  }, []);

  // 링크 삽입 핸들러
  const handleInsertLink = useCallback((url: string, text: string) => {
    if (!ctxRef.current) return;

    try {
      const view = ctxRef.current.get(editorViewCtx);
      const { state, dispatch } = view;
      const { schema, selection } = state;
      const linkMark = schema.marks.link;

      if (!linkMark) return;

      // 트랜잭션 생성
      let tr = state.tr;

      // 선택된 텍스트가 있으면 그 위치에 링크 적용
      if (!selection.empty) {
        tr = tr.addMark(
          selection.from,
          selection.to,
          linkMark.create({ href: url })
        );
      } else {
        // 선택된 텍스트가 없으면 새 텍스트와 함께 링크 삽입
        const linkText = schema.text(text, [linkMark.create({ href: url })]);
        tr = tr.replaceSelectionWith(linkText, false);
      }

      dispatch(tr);
      view.focus();
    } catch (err) {
      console.error('링크 삽입 오류:', err);
    }
  }, []);

  // 브라우저 단축키 충돌 방지 및 커스텀 단축키 처리 (document 레벨 capture)
  // 참고: Cmd+1~9는 브라우저가 JS 이전에 처리하여 오버라이드 불가
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd(Mac) 또는 Ctrl(Win) 키가 눌렸는지 확인
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const editorContainer = editorRef.current;
      if (!editorContainer) return;

      // e.code는 물리적 키 위치 (Option 키와 함께 눌러도 변하지 않음)
      const code = e.code;
      const key = e.key.toLowerCase();

      // Cmd+Alt+K: 링크 다이얼로그 열기
      // e.code 사용 (맥에서 Option+K가 특수문자 '˚'를 생성하므로)
      // ctxRef가 있으면 작동 (에디터가 초기화된 상태)
      if (e.altKey && code === 'KeyK' && ctxRef.current) {
        e.preventDefault();
        e.stopPropagation();
        handleOpenLinkDialog();
        return;
      }

      // 아래 단축키들은 에디터에 포커스가 있을 때만 동작
      if (!editorContainer.contains(document.activeElement)) return;

      // Alt 키가 눌린 다른 조합은 플러그인에서 처리
      if (e.altKey) return;

      // Cmd+S (Alt 없이): 저장 콜백 실행 및 브라우저 기본 동작 차단
      if (key === 's') {
        e.preventDefault();
        e.stopPropagation();
        if (onSaveRef.current) {
          onSaveRef.current();
        }
        return;
      }

      // Cmd+K (Alt 없이): 주소창 열기 방지
      if (code === 'KeyK') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    };

    // capture phase에서 가장 먼저 이벤트 처리
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [handleOpenLinkDialog]);

  // 에디터 초기화
  useEffect(() => {
    if (!editorRef.current) return;

    const initEditor = async () => {
      // 기존 에디터 정리
      if (editorInstanceRef.current) {
        await editorInstanceRef.current.destroy();
      }

      // Slash Provider용 컨테이너 생성
      const slashContent = document.createElement('div');
      slashContent.className = 'slash-provider-container';

      // 새 에디터 인스턴스 생성
      const editor = await Editor.make()
        .config(nord) // Nord 테마 적용
        .config((ctx) => {
          // 컨텍스트 참조 저장
          ctxRef.current = ctx;

          // 루트 DOM 요소 설정
          ctx.set(rootCtx, editorRef.current!);

          // 초기값 설정 (ref 사용으로 재초기화 방지)
          if (initialValueRef.current) {
            ctx.set(defaultValueCtx, initialValueRef.current);
          }

          // 마크다운 변경 리스너 설정
          const listenerHandler = ctx.get(listenerCtx);
          listenerHandler.markdownUpdated((_ctx, markdown, prevMarkdown) => {
            if (markdown !== prevMarkdown) {
              debouncedOnChange(markdown);
            }
          });

          // Slash 플러그인 설정
          if (enableSlash) {
            ctx.set(slash.key, {
              view: (view) => {
                const provider = new SlashProvider({
                  content: slashContent,
                  shouldShow: (view, prevState) => {
                    // "/" 입력 시 메뉴 표시
                    const { state } = view;
                    const { selection } = state;
                    const { $from } = selection;

                    // 현재 줄의 텍스트 가져오기
                    const textBefore = $from.parent.textContent.slice(
                      0,
                      $from.parentOffset
                    );

                    // "/" 로 시작하는지 확인
                    const slashMatch = textBefore.match(/\/(\w*)$/);

                    if (slashMatch) {
                      // 필터 텍스트 업데이트
                      setSlashFilter(slashMatch[1] || '');
                      return true;
                    }

                    return false;
                  },
                });

                slashProviderRef.current = provider;

                return {
                  update: (updatedView, prevState) => {
                    provider.update(updatedView, prevState);

                    // 메뉴 위치 및 표시 상태 업데이트
                    const { state } = updatedView;
                    const { selection } = state;
                    const { $from } = selection;

                    const textBefore = $from.parent.textContent.slice(
                      0,
                      $from.parentOffset
                    );
                    const slashMatch = textBefore.match(/\/(\w*)$/);

                    if (slashMatch) {
                      // 커서 위치 계산
                      const coords = updatedView.coordsAtPos(selection.from);
                      setSlashMenuPosition({
                        x: coords.left,
                        y: coords.bottom + 8,
                      });
                      setSlashMenuVisible(true);
                      setSlashFilter(slashMatch[1] || '');
                    } else {
                      setSlashMenuVisible(false);
                      setSlashFilter('');
                    }
                  },
                  destroy: () => {
                    provider.destroy();
                    slashContent.remove();
                  },
                };
              },
            });
          }
        })
        // 이미지 업로드 플러그인 설정
        .config(
          enableImageUpload
            ? configureImageUpload({
                onProgress: handleUploadProgress,
                onError: onUploadError,
              })
            : () => {}
        )
        .use(commonmark) // CommonMark 문법
        .use(gfm) // GFM 확장
        .use(history) // Undo/Redo
        .use(listener) // 변경 감지
        .use(enableSlash ? slash : []) // Slash 메뉴 (조건부)
        .use(keyboardShortcutsPlugin) // 키보드 단축키
        .use(enableImageUpload ? imageUploadPlugin : []) // 이미지 업로드
        .use(codeBlockLanguagePlugin) // 코드블록 언어 선택기
        .use(blockquoteEscapePlugin) // 인용구 탈출
        .use(codeBlockEscapePlugin) // 코드블록 탈출 및 삭제
        .use(prismHighlightPlugin) // 코드 하이라이팅
        .create();

      editorInstanceRef.current = editor;
    };

    initEditor();

    // 클린업
    return () => {
      if (editorInstanceRef.current) {
        editorInstanceRef.current.destroy();
        editorInstanceRef.current = null;
        ctxRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableSlash, enableImageUpload]);

  return (
    <div
      className={`milkdown-editor-wrapper ${className} ${isDragOver ? 'drag-over' : ''}`.trim()}
      data-readonly={readOnly}
      data-placeholder={placeholder}
      data-theme={editorTheme}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div ref={editorRef} className="milkdown-editor-container" />

      {/* Slash 메뉴 */}
      {enableSlash && (
        <SlashMenu
          items={defaultSlashItems}
          visible={slashMenuVisible}
          position={slashMenuPosition}
          filter={slashFilter}
          onSelect={handleSlashSelect}
          onClose={handleSlashClose}
        />
      )}

      {/* 하단 고정 버튼 영역 */}
      <div className="editor-floating-buttons">
        {/* 마크다운 Import 버튼 */}
        {showImportButton && (
          <>
            <input
              ref={importInputRef}
              type="file"
              accept=".md,.markdown,.txt"
              onChange={handleImportMarkdown}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={handleImportClick}
              className="editor-import-btn"
              aria-label="마크다운 파일 Import"
              title="마크다운 파일 Import (.md)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </button>
          </>
        )}

        {/* 테마 토글 버튼 */}
        <button
          type="button"
          onClick={handleThemeToggle}
          className="editor-theme-toggle"
          aria-label={`${editorTheme === 'dark' ? '라이트' : '다크'} 모드로 전환`}
          title={`${editorTheme === 'dark' ? '라이트' : '다크'} 모드로 전환`}
        >
          {editorTheme === 'dark' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          )}
        </button>

        {/* 키보드 단축키 도움말 버튼 */}
        {showShortcutsHelp && <KeyboardShortcutsButton />}
      </div>

      {/* 이미지 업로드 진행률 */}
      {enableImageUpload && (
        <UploadProgress
          progress={uploadProgress}
          status={uploadStatus}
          fileName={uploadFileName}
          onHide={handleUploadHide}
        />
      )}

      {/* 드래그 앤 드롭 오버레이 */}
      {isDragOver && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">
            <span className="drag-overlay-icon">🎬</span>
            <span className="drag-overlay-text">이미지/동영상을 여기에 놓으세요</span>
          </div>
        </div>
      )}

      {/* 링크 삽입 다이얼로그 */}
      <LinkDialog
        isOpen={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        onInsert={handleInsertLink}
        initialText={linkDialogText}
      />
    </div>
  );
}

export default MilkdownEditor;
