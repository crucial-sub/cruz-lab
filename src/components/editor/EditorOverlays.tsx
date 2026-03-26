type ShortcutDefinition = {
  label: string;
  key: string;
};

type QuickInsertDefinition = {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
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

const quickInsertDefinitions: QuickInsertDefinition[] = [
  { id: 'heading1', label: '제목 1', description: '현재 줄을 H1으로 바꾸거나 되돌립니다.', shortcut: '⌘/Ctrl+Alt+1' },
  { id: 'heading2', label: '제목 2', description: '현재 줄을 H2로 바꾸거나 되돌립니다.', shortcut: '⌘/Ctrl+Alt+2' },
  { id: 'heading3', label: '제목 3', description: '현재 줄을 H3로 바꾸거나 되돌립니다.', shortcut: '⌘/Ctrl+Alt+3' },
  { id: 'checklist', label: '체크리스트', description: '`- [ ]` 형식의 체크리스트를 추가합니다.', shortcut: '⌘/Ctrl+Alt+L' },
  { id: 'bullet-list', label: '글머리 목록', description: '`-` 글머리 목록을 추가합니다.' },
  { id: 'blockquote', label: '인용구', description: '현재 줄 앞에 `>`를 붙입니다.', shortcut: '⌘/Ctrl+Alt+Q' },
  { id: 'codeblock', label: '코드 블록', description: '언어가 포함된 fenced code block을 삽입합니다.', shortcut: '⌘/Ctrl+Alt+C' },
  { id: 'table', label: '표', description: '2열 표 템플릿을 넣습니다.' },
  { id: 'divider', label: '구분선', description: '`---` 구분선을 넣습니다.' },
];

export function QuickInsertDialog({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="quick-insert-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-insert-title"
    >
      <button
        type="button"
        className="editor-overlay-dismiss"
        onClick={onClose}
        aria-label="빠른 삽입 닫기"
      />
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
            onClick={onClose}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <div className="quick-insert-grid">
          {quickInsertDefinitions.map((item) => (
            <button
              key={item.id}
              type="button"
              className="quick-insert-item"
              onClick={() => onSelect(item.id)}
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
  );
}

export function KeyboardShortcutsDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <div
      className="keyboard-shortcuts-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="codemirror-shortcuts-title"
    >
      <button
        type="button"
        className="editor-overlay-dismiss"
        onClick={onClose}
        aria-label="키보드 단축키 닫기"
      />
      <div className="keyboard-shortcuts-modal">
        <div className="keyboard-shortcuts-header">
          <h2 id="codemirror-shortcuts-title" className="keyboard-shortcuts-title">
            키보드 단축키
          </h2>
          <button
            type="button"
            className="keyboard-shortcuts-close"
            onClick={onClose}
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
  );
}
