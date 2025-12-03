/**
 * UploadProgress - 이미지 업로드 진행률 표시 컴포넌트
 *
 * 에디터에서 이미지 업로드 시 진행률을 시각적으로 표시합니다.
 * - 프로그레스 바 애니메이션
 * - 상태별 아이콘 및 색상
 * - 자동 숨김 (완료/에러 후)
 */

import { useEffect, useState } from 'react';
import type { UploadStatus } from './plugins/imageUpload';

interface UploadProgressProps {
  /** 업로드 진행률 (0-100) */
  progress: number;
  /** 업로드 상태 */
  status: UploadStatus;
  /** 파일명 */
  fileName?: string;
  /** 숨김 처리 콜백 */
  onHide?: () => void;
}

/**
 * 상태별 아이콘 반환
 */
function getStatusIcon(status: UploadStatus): string {
  switch (status) {
    case 'uploading':
      return '⏳';
    case 'success':
      return '✓';
    case 'error':
      return '✕';
    default:
      return '';
  }
}

/**
 * 상태별 메시지 반환
 */
function getStatusMessage(status: UploadStatus, progress: number): string {
  switch (status) {
    case 'uploading':
      return `업로드 중... ${Math.round(progress)}%`;
    case 'success':
      return '업로드 완료!';
    case 'error':
      return '업로드 실패';
    default:
      return '';
  }
}

/**
 * 업로드 진행률 컴포넌트
 */
export function UploadProgress({
  progress,
  status,
  fileName,
  onHide,
}: UploadProgressProps) {
  const [visible, setVisible] = useState(false);

  // 상태 변경 시 표시
  useEffect(() => {
    if (status === 'uploading') {
      setVisible(true);
    }
  }, [status]);

  // 완료/에러 시 자동 숨김
  useEffect(() => {
    if (status === 'success' || status === 'error') {
      const timer = setTimeout(() => {
        setVisible(false);
        onHide?.();
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [status, onHide]);

  // 숨김 상태면 렌더링하지 않음
  if (!visible && status === 'idle') return null;

  return (
    <div
      className={`upload-progress ${status} ${visible ? 'visible' : 'hidden'}`}
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="이미지 업로드 진행률"
    >
      <div className="upload-progress-content">
        {/* 아이콘 */}
        <span className="upload-progress-icon">{getStatusIcon(status)}</span>

        {/* 정보 */}
        <div className="upload-progress-info">
          {fileName && (
            <span className="upload-progress-filename" title={fileName}>
              {fileName.length > 20 ? `${fileName.substring(0, 20)}...` : fileName}
            </span>
          )}
          <span className="upload-progress-message">
            {getStatusMessage(status, progress)}
          </span>
        </div>

        {/* 프로그레스 바 */}
        {status === 'uploading' && (
          <div className="upload-progress-bar-container">
            <div
              className="upload-progress-bar"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 다중 업로드 진행률 관리 훅
 */
export function useUploadProgress() {
  const [uploads, setUploads] = useState<
    Map<string, { progress: number; status: UploadStatus; fileName: string }>
  >(new Map());

  const updateProgress = (
    id: string,
    progress: number,
    status: UploadStatus,
    fileName: string
  ) => {
    setUploads((prev) => {
      const newMap = new Map(prev);
      newMap.set(id, { progress, status, fileName });
      return newMap;
    });
  };

  const removeUpload = (id: string) => {
    setUploads((prev) => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });
  };

  const clearAll = () => {
    setUploads(new Map());
  };

  return {
    uploads,
    updateProgress,
    removeUpload,
    clearAll,
  };
}

/**
 * 다중 업로드 진행률 표시 컴포넌트
 */
export function UploadProgressList({
  uploads,
  onRemove,
}: {
  uploads: Map<string, { progress: number; status: UploadStatus; fileName: string }>;
  onRemove: (id: string) => void;
}) {
  if (uploads.size === 0) return null;

  return (
    <div className="upload-progress-list">
      {Array.from(uploads.entries()).map(([id, upload]) => (
        <UploadProgress
          key={id}
          progress={upload.progress}
          status={upload.status}
          fileName={upload.fileName}
          onHide={() => onRemove(id)}
        />
      ))}
    </div>
  );
}

export default UploadProgress;
