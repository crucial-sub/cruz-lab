/**
 * SlashMenu - Slash Commands 메뉴 UI 컴포넌트
 *
 * `/` 입력 시 표시되는 명령어 메뉴를 렌더링합니다.
 * - 키보드 네비게이션 (↑↓ Enter Escape) 지원
 * - 필터링 기능
 * - 그룹별 분류 표시
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SlashMenuItem } from './plugins/slashPlugin';
import {
  filterSlashItems,
  groupSlashItems,
  groupLabels,
} from './plugins/slashPlugin';

interface SlashMenuProps {
  /** 전체 메뉴 아이템 목록 */
  items: SlashMenuItem[];
  /** 아이템 선택 시 콜백 */
  onSelect: (item: SlashMenuItem) => void;
  /** 메뉴 표시 여부 */
  visible: boolean;
  /** 메뉴 위치 */
  position: { x: number; y: number };
  /** 필터 문자열 (/ 이후 입력된 텍스트) */
  filter: string;
  /** 메뉴 닫기 콜백 */
  onClose: () => void;
}

/**
 * Slash Commands 메뉴 컴포넌트
 */
export function SlashMenu({
  items,
  onSelect,
  visible,
  position,
  filter,
  onClose,
}: SlashMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // 필터링된 아이템
  const filteredItems = filterSlashItems(items, filter);
  // 그룹별 아이템
  const groupedItems = groupSlashItems(filteredItems);

  // 선택된 인덱스를 필터 변경 시 초기화
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  // 선택된 아이템이 보이도록 스크롤
  useEffect(() => {
    const selectedRef = itemRefs.current.get(selectedIndex);
    if (selectedRef && menuRef.current) {
      selectedRef.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  // 키보드 네비게이션 핸들러
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) =>
            prev < filteredItems.length - 1 ? prev + 1 : 0
          );
          break;

        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredItems.length - 1
          );
          break;

        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          if (filteredItems[selectedIndex]) {
            onSelect(filteredItems[selectedIndex]);
          }
          break;

        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
      }
    },
    [visible, filteredItems, selectedIndex, onSelect, onClose]
  );

  // 키보드 이벤트 리스너 등록
  useEffect(() => {
    if (visible) {
      document.addEventListener('keydown', handleKeyDown, true);
      return () => {
        document.removeEventListener('keydown', handleKeyDown, true);
      };
    }
  }, [visible, handleKeyDown]);

  // 외부 클릭 시 메뉴 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (visible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [visible, onClose]);

  // 메뉴가 숨겨져 있거나 필터링된 아이템이 없으면 렌더링하지 않음
  if (!visible || filteredItems.length === 0) return null;

  // 평탄화된 아이템 인덱스 계산
  let flatIndex = 0;

  return (
    <div
      ref={menuRef}
      className="slash-menu"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      role="listbox"
      aria-label="Slash Commands 메뉴"
    >
      {Array.from(groupedItems.entries()).map(([group, groupItems]) => (
        <div key={group} className="slash-menu-group">
          <div className="slash-menu-group-label">
            {groupLabels[group] || group}
          </div>
          {groupItems.map((item) => {
            const currentIndex = flatIndex++;
            const isSelected = currentIndex === selectedIndex;

            return (
              <div
                key={item.id}
                ref={(el) => {
                  if (el) {
                    itemRefs.current.set(currentIndex, el);
                  }
                }}
                className={`slash-menu-item ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelect(item)}
                onMouseEnter={() => setSelectedIndex(currentIndex)}
                role="option"
                aria-selected={isSelected}
              >
                <span className="slash-menu-icon">{item.icon}</span>
                <span className="slash-menu-label">{item.label}</span>
              </div>
            );
          })}
        </div>
      ))}

      {/* 필터 결과 없음 표시 */}
      {filteredItems.length === 0 && filter && (
        <div className="slash-menu-empty">
          &quot;{filter}&quot;에 해당하는 명령어가 없습니다
        </div>
      )}
    </div>
  );
}

export default SlashMenu;
