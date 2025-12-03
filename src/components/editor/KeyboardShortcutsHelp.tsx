/**
 * KeyboardShortcutsHelp - 키보드 단축키 도움말 UI 컴포넌트
 *
 * 에디터에서 사용 가능한 키보드 단축키 목록을 표시합니다.
 * - 운영체제별 키 표시 대응 (Mac: ⌘, Windows: Ctrl)
 * - 카테고리별 그룹화
 * - 모달 형태의 도움말 UI
 */

import { useState, useEffect, useCallback } from 'react';
import {
  shortcutDefinitions,
  categoryLabels,
  getShortcutKey,
  groupShortcutsByCategory,
  isMac,
} from './plugins/keyboardShortcuts';

interface KeyboardShortcutsHelpProps {
  /** 모달 표시 여부 */
  isOpen: boolean;
  /** 모달 닫기 콜백 */
  onClose: () => void;
}

/**
 * 키보드 단축키 도움말 컴포넌트
 */
export function KeyboardShortcutsHelp({
  isOpen,
  onClose,
}: KeyboardShortcutsHelpProps) {
  const [isMacOS, setIsMacOS] = useState(false);

  // 클라이언트 사이드에서 OS 감지
  useEffect(() => {
    setIsMacOS(isMac());
  }, []);

  // ESC 키로 닫기
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, handleKeyDown]);

  // 모달 외부 클릭 시 닫기
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // 카테고리별 그룹화된 단축키
  const groupedShortcuts = groupShortcutsByCategory();

  if (!isOpen) return null;

  return (
    <div
      className="keyboard-shortcuts-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div className="keyboard-shortcuts-modal">
        {/* 헤더 */}
        <div className="keyboard-shortcuts-header">
          <h2 id="shortcuts-title" className="keyboard-shortcuts-title">
            키보드 단축키
          </h2>
          <span className="keyboard-shortcuts-os">
            {isMacOS ? 'macOS' : 'Windows/Linux'}
          </span>
          <button
            className="keyboard-shortcuts-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 단축키 목록 */}
        <div className="keyboard-shortcuts-content">
          {Array.from(groupedShortcuts.entries()).map(([category, shortcuts]) => (
            <div key={category} className="keyboard-shortcuts-group">
              <h3 className="keyboard-shortcuts-group-title">
                {categoryLabels[category] || category}
              </h3>
              <ul className="keyboard-shortcuts-list">
                {shortcuts.map((shortcut) => (
                  <li key={shortcut.id} className="keyboard-shortcuts-item">
                    <span className="keyboard-shortcuts-label">
                      {shortcut.label}
                    </span>
                    <kbd className="keyboard-shortcuts-key">
                      {getShortcutKey(shortcut)}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 푸터 */}
        <div className="keyboard-shortcuts-footer">
          <span className="keyboard-shortcuts-hint">
            {isMacOS ? '⌘' : 'Ctrl'}+? 로 이 도움말 열기
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * 키보드 단축키 도움말 버튼 컴포넌트
 *
 * 클릭 시 도움말 모달을 표시합니다.
 */
export function KeyboardShortcutsButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMacOS, setIsMacOS] = useState(false);

  // 클라이언트 사이드에서 OS 감지
  useEffect(() => {
    setIsMacOS(isMac());
  }, []);

  // Cmd/Ctrl+? 단축키로 도움말 열기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Mod+? (Cmd+Shift+/ on Mac, Ctrl+Shift+/ on Windows)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '/') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <>
      <button
        className="keyboard-shortcuts-trigger"
        onClick={() => setIsOpen(true)}
        title={`키보드 단축키 (${isMacOS ? '⌘' : 'Ctrl'}+?)`}
        aria-label="키보드 단축키 보기"
      >
        <span className="keyboard-shortcuts-trigger-icon">⌨</span>
      </button>

      <KeyboardShortcutsHelp isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

export default KeyboardShortcutsHelp;
