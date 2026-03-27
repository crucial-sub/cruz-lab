import { getClientAdminIdToken } from '@/lib/firebase-auth-client';
import type { CmsAssetScope, ImageUploadConfig } from './upload-types';

const VIDEO_MIME_TYPES = ['video/webm', 'video/mp4', 'video/quicktime', 'video/x-m4v'];

const defaultConfig: Required<Omit<ImageUploadConfig, 'onProgress' | 'onError'>> = {
  maxFileSize: 50 * 1024 * 1024,
  allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', ...VIDEO_MIME_TYPES],
  storagePath: 'images/blog',
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.85,
};

export async function generateLQIP(file: File, size: number = 20): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      const ratio = Math.min(size / img.width, size / img.height);
      const width = Math.round(img.width * ratio);
      const height = Math.round(img.height * ratio);

      canvas.width = width;
      canvas.height = height;

      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'low';
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.1));
      } else {
        reject(new Error('Canvas 컨텍스트 생성 실패'));
      }
    };

    img.onerror = () => reject(new Error('LQIP 생성 실패'));
    img.src = URL.createObjectURL(file);
  });
}

async function resizeImage(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width *= ratio;
        height *= ratio;
      }

      canvas.width = width;
      canvas.height = height;

      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('이미지 변환 실패'));
            }
          },
          file.type === 'image/png' ? 'image/png' : 'image/jpeg',
          quality
        );
      } else {
        reject(new Error('Canvas 컨텍스트 생성 실패'));
      }
    };

    img.onerror = () => reject(new Error('이미지 로드 실패'));
    img.src = URL.createObjectURL(file);
  });
}

function mapStoragePathToScope(storagePath: string): CmsAssetScope {
  if (storagePath.includes('heroes')) return 'heroes';
  if (storagePath.includes('series')) return 'series-covers';
  return 'blog';
}

function uploadViaCmsApi({
  file,
  scope,
  idToken,
  onProgress,
}: {
  file: Blob | File;
  scope: CmsAssetScope;
  idToken: string;
  onProgress?: ImageUploadConfig['onProgress'];
}) {
  return new Promise<string>((resolve, reject) => {
    const formData = new FormData();
    formData.append(
      'file',
      file instanceof File ? file : new File([file], `upload-${Date.now()}.jpg`, { type: file.type || 'image/jpeg' })
    );
    formData.append('scope', scope);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/upload-asset');
    xhr.timeout = 60000;
    xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const progress = (event.loaded / event.total) * 100;
      onProgress?.(progress, 'uploading', file instanceof File ? file.name : undefined);
    };

    xhr.upload.onload = () => {
      onProgress?.(100, 'processing', file instanceof File ? file.name : undefined);
    };

    xhr.onerror = () => {
      reject(new Error('관리자 업로드 요청이 브라우저에서 실패했습니다.'));
    };

    xhr.ontimeout = () => {
      reject(new Error('자산 업로드 요청이 시간 안에 끝나지 않았습니다.'));
    };

    xhr.onload = () => {
      try {
        const result = JSON.parse(xhr.responseText || '{}');
        if (xhr.status < 200 || xhr.status >= 300) {
          throw new Error(result.message || 'GitHub 자산 업로드에 실패했습니다.');
        }

        onProgress?.(100, 'success', file instanceof File ? file.name : undefined);
        resolve(result.publicPath || result.previewUrl || result.publicUrl);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('자산 업로드 응답 처리에 실패했습니다.'));
      }
    };

    xhr.send(formData);
  });
}

export async function uploadCmsAsset(
  file: File,
  config: ImageUploadConfig = {}
): Promise<string> {
  const mergedConfig = { ...defaultConfig, ...config };
  const { maxFileSize, allowedTypes, storagePath, maxWidth, maxHeight, quality, onProgress, onError } =
    mergedConfig;

  if (!allowedTypes.includes(file.type)) {
    const error = new Error(`지원하지 않는 파일 형식입니다: ${file.type}`);
    onError?.(error);
    throw error;
  }

  if (file.size > maxFileSize) {
    const maxSizeMB = (maxFileSize / (1024 * 1024)).toFixed(1);
    const error = new Error(`파일 크기가 ${maxSizeMB}MB를 초과합니다`);
    onError?.(error);
    throw error;
  }

  try {
    onProgress?.(0, 'authenticating', file.name);
    const idToken = await getClientAdminIdToken({ forceRefresh: true });

    const isVideo = VIDEO_MIME_TYPES.includes(file.type);
    onProgress?.(0, isVideo ? 'uploading' : 'processing', file.name);
    const uploadBlob = isVideo ? file : await resizeImage(file, maxWidth, maxHeight, quality);

    return await uploadViaCmsApi({
      file: uploadBlob instanceof File ? uploadBlob : new File([uploadBlob], file.name, { type: uploadBlob.type || file.type }),
      scope: mapStoragePathToScope(storagePath),
      idToken,
      onProgress: (progress, status) => onProgress?.(progress, status, file.name),
    });
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('자산 업로드 중 오류가 발생했습니다.');
    onProgress?.(0, 'error', file.name);
    onError?.(normalizedError);
    throw normalizedError;
  }
}

export const uploadImageToFirebase = uploadCmsAsset;
