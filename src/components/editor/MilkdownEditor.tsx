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
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core';
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
}: MilkdownEditorProps) {
  // 에디터 DOM 참조
  const editorRef = useRef<HTMLDivElement>(null);
  // 에디터 인스턴스 참조
  const editorInstanceRef = useRef<Editor | null>(null);
  // 에디터 컨텍스트 참조
  const ctxRef = useRef<Ctx | null>(null);
  // onChange 콜백 참조 (재생성 방지)
  const onChangeRef = useRef(onChange);
  // Slash Provider 참조
  const slashProviderRef = useRef<SlashProvider | null>(null);

  // Slash 메뉴 상태
  const [slashMenuVisible, setSlashMenuVisible] = useState(false);
  const [slashMenuPosition, setSlashMenuPosition] = useState({ x: 0, y: 0 });
  const [slashFilter, setSlashFilter] = useState('');

  // 이미지 업로드 상태
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadFileName, setUploadFileName] = useState<string | undefined>();
  const [isDragOver, setIsDragOver] = useState(false);

  // onChange 참조 업데이트
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // 디바운스된 onChange 핸들러
  const debouncedOnChange = useCallback((markdown: string) => {
    if (onChangeRef.current) {
      onChangeRef.current(markdown);
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

          // 초기값 설정
          if (defaultValue) {
            ctx.set(defaultValueCtx, defaultValue);
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
  }, [defaultValue, debouncedOnChange, enableSlash, enableImageUpload, handleUploadProgress, onUploadError]);

  return (
    <div
      className={`milkdown-editor-wrapper ${className} ${isDragOver ? 'drag-over' : ''}`.trim()}
      data-readonly={readOnly}
      data-placeholder={placeholder}
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

      {/* 키보드 단축키 도움말 버튼 */}
      {showShortcutsHelp && <KeyboardShortcutsButton />}

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
            <span className="drag-overlay-icon">📷</span>
            <span className="drag-overlay-text">이미지를 여기에 놓으세요</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default MilkdownEditor;
