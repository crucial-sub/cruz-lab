/**
 * 링크 다이얼로그 컴포넌트
 *
 * URL과 표시 텍스트를 입력받아 링크를 삽입합니다.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface LinkDialogProps {
  /** 다이얼로그 표시 여부 */
  isOpen: boolean;
  /** 다이얼로그 닫기 콜백 */
  onClose: () => void;
  /** 링크 삽입 콜백 */
  onInsert: (url: string, text: string) => void;
  /** 초기 URL 값 */
  initialUrl?: string;
  /** 초기 텍스트 값 (선택된 텍스트) */
  initialText?: string;
}

/**
 * 링크 삽입/편집 다이얼로그
 */
export function LinkDialog({
  isOpen,
  onClose,
  onInsert,
  initialUrl = '',
  initialText = '',
}: LinkDialogProps) {
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState(initialText);
  const urlInputRef = useRef<HTMLInputElement>(null);

  // 다이얼로그가 열릴 때 초기값 설정 및 포커스
  useEffect(() => {
    if (isOpen) {
      setUrl(initialUrl);
      setText(initialText);
      // URL 입력에 포커스
      setTimeout(() => {
        urlInputRef.current?.focus();
        urlInputRef.current?.select();
      }, 50);
    }
  }, [isOpen, initialUrl, initialText]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 배경 클릭 시 닫기
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // 폼 제출
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!url.trim()) return;

      // URL 자동 완성 (http:// 추가)
      let finalUrl = url.trim();
      if (!/^https?:\/\//i.test(finalUrl) && !finalUrl.startsWith('/')) {
        finalUrl = 'https://' + finalUrl;
      }

      // 텍스트가 없으면 URL 사용
      const finalText = text.trim() || finalUrl;

      onInsert(finalUrl, finalText);
      onClose();
    },
    [url, text, onInsert, onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="link-dialog-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="link-dialog-title"
    >
      <div className="link-dialog-modal">
        <div className="link-dialog-header">
          <h3 id="link-dialog-title" className="link-dialog-title">
            링크 삽입
          </h3>
          <button
            type="button"
            className="link-dialog-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="link-dialog-form">
          <div className="link-dialog-field">
            <label htmlFor="link-url" className="link-dialog-label">
              URL
            </label>
            <input
              ref={urlInputRef}
              id="link-url"
              type="text"
              className="link-dialog-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              autoComplete="off"
            />
          </div>

          <div className="link-dialog-field">
            <label htmlFor="link-text" className="link-dialog-label">
              표시 텍스트 <span className="link-dialog-optional">(선택)</span>
            </label>
            <input
              id="link-text"
              type="text"
              className="link-dialog-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="링크 텍스트"
              autoComplete="off"
            />
          </div>

          <div className="link-dialog-actions">
            <button
              type="button"
              className="link-dialog-btn link-dialog-btn-cancel"
              onClick={onClose}
            >
              취소
            </button>
            <button
              type="submit"
              className="link-dialog-btn link-dialog-btn-submit"
              disabled={!url.trim()}
            >
              삽입
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default LinkDialog;
