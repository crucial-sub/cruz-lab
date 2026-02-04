// 네트워크 상태 UI 컴포넌트
// 오프라인 시 토스트 알림 표시
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { isOnline, onNetworkChange } from '@/lib/offline-posts';

export default function NetworkStatus() {
  const [online, setOnline] = useState(true);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    // 초기 상태 설정
    setOnline(isOnline());

    // 네트워크 상태 변경 감지
    const unsubscribe = onNetworkChange((isOnline) => {
      setOnline(isOnline);
      setShowToast(true);

      // 온라인 복구 시 3초 후 토스트 숨김
      if (isOnline) {
        setTimeout(() => setShowToast(false), 3000);
      }
    });

    return unsubscribe;
  }, []);

  return (
    <AnimatePresence>
      {showToast && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2"
        >
          <div
            className={`flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg backdrop-blur-md ${
              online
                ? 'bg-brand/90 text-white'
                : 'bg-bg-surface/90 border border-border text-text-primary'
            }`}
          >
            {online ? (
              <>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="font-medium">온라인 연결됨</span>
              </>
            ) : (
              <>
                <svg className="h-5 w-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3"
                  />
                </svg>
                <div>
                  <p className="font-medium">오프라인 모드</p>
                  <p className="text-sm text-text-secondary">캐시된 콘텐츠만 표시됩니다</p>
                </div>
                <button
                  onClick={() => setShowToast(false)}
                  className="ml-2 rounded-lg p-1 hover:bg-border/50 transition-colors"
                  aria-label="닫기"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
