export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

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
