// 키 잡기 (재건 5단계 D14)
// - 켜져 있는 동안 창의 keydown을 먼저 받는다(capture). 다른 화면 키(Shift+N 등)와 브라우저 기본 동작을 막는다.
// - 수식 키만 누르면 기다린다. 수식 키 없는 Esc는 취소다. 그 밖의 키는 키 문자열로 바꿔 onCapture에 넘긴다.
// - 브라우저·OS가 먼저 가져가는 키(⌘W, ⌘Tab 등)는 페이지에 오지 않는다. 검사(keymap-settings.ts)도 막는다.
// - 이 표시 밖을 누르거나 창이 포커스를 잃으면 취소한다(다음 키를 몰래 잡지 않게, 리뷰 B15).

import { useEffect, useRef } from 'react';
import type { Platform } from '@/editor/commands/keymap';
import { keyFromEvent } from '@/editor/commands/keymap-settings';

export function KeyCapture({
  platform,
  onCapture,
  onCancel,
}: {
  platform: Platform;
  onCapture: (key: string) => void;
  onCancel: () => void;
}) {
  // 최신 함수를 ref로 읽는다(부모가 다시 그려도 리스너를 다시 걸지 않는다)
  const latest = useRef({ onCapture, onCancel });
  latest.current = { onCapture, onCancel };

  const boxRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // 바깥 누르기·창 포커스 잃기는 취소다
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !boxRef.current?.contains(event.target))
        latest.current.onCancel();
    };
    const onWindowBlur = () => latest.current.onCancel();
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('blur', onWindowBlur);
    const onKeyDown = (event: KeyboardEvent) => {
      // 한글 조합 중 키는 버린다
      if (event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      const plain = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
      if (event.key === 'Escape' && plain) {
        latest.current.onCancel();
        return;
      }
      const key = keyFromEvent(event, platform);
      if (key) latest.current.onCapture(key);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [platform]);

  return (
    <span
      ref={boxRef}
      className="bg-brand/10 inline-flex items-center rounded-md border border-brand px-2 py-1 text-xs font-medium text-text-primary"
      role="status"
      aria-live="polite"
    >
      키를 누르세요 · Esc 취소
    </span>
  );
}
