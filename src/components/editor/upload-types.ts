export type UploadStatus =
  | 'idle'
  | 'authenticating'
  | 'processing'
  | 'uploading'
  | 'success'
  | 'error';

export type UploadProgressCallback = (
  progress: number,
  status: UploadStatus,
  fileName?: string
) => void;

export interface ImageUploadConfig {
  maxFileSize?: number;
  allowedTypes?: string[];
  storagePath?: string;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  onProgress?: UploadProgressCallback;
  onError?: (error: Error) => void;
}

// 시리즈 커버 범위(series-covers)는 재건 2단계에서 시리즈 관리 화면과 함께 뺐다
export type CmsAssetScope = 'blog' | 'heroes';
