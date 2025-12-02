// 자동 저장 훅
// 데이터 변경 시 디바운스로 자동 저장 실행
import { useEffect, useRef, useCallback } from 'react';

interface UseAutoSaveOptions<T> {
  data: T;
  onSave: () => void | Promise<void>;
  delay?: number;
  enabled?: boolean;
}

export function useAutoSave<T>({
  data,
  onSave,
  delay = 5000,
  enabled = true,
}: UseAutoSaveOptions<T>) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstRender = useRef(true);
  const previousDataRef = useRef<string>('');

  // 저장 함수 (디바운스 적용)
  const debouncedSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      onSave();
    }, delay);
  }, [onSave, delay]);

  useEffect(() => {
    // 첫 렌더링에서는 저장하지 않음
    if (isFirstRender.current) {
      isFirstRender.current = false;
      previousDataRef.current = JSON.stringify(data);
      return;
    }

    // 비활성화 상태면 저장하지 않음
    if (!enabled) return;

    // 데이터가 변경되었는지 확인
    const currentData = JSON.stringify(data);
    if (currentData === previousDataRef.current) return;

    previousDataRef.current = currentData;
    debouncedSave();

    // 클린업: 언마운트 시 타이머 정리
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, enabled, debouncedSave]);

  // 즉시 저장 함수 (타이머 무시)
  const saveNow = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    onSave();
  }, [onSave]);

  // 저장 취소 함수
  const cancelSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return { saveNow, cancelSave };
}
