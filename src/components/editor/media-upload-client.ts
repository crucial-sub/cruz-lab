import { getClientAdminIdToken } from '@/lib/firebase-auth-client';
import type { ImageUploadConfig } from './upload-types';

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

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

async function uploadViaFirebaseStorage({
  file,
  storagePath,
  onProgress,
}: {
  file: File;
  storagePath: string;
  onProgress?: ImageUploadConfig['onProgress'];
}) {
  const [{ ref, uploadBytesResumable, getDownloadURL }, { storage }] = await Promise.all([
    import('firebase/storage'),
    import('@/lib/firebase'),
  ]);

  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const extension = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const safeName = sanitizeFileName(file.name.replace(/\.[^/.]+$/, '')).slice(0, 40) || 'asset';
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const fullPath = `${storagePath}/${year}/${month}/${safeName}-${timestamp}-${random}.${extension}`;
  const storageRef = ref(storage, fullPath);

  return new Promise<string>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
      cacheControl: 'public,max-age=31536000,immutable',
    });

    task.on(
      'state_changed',
      (snapshot) => {
        const progress = snapshot.totalBytes
          ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          : 0;
        onProgress?.(progress, 'uploading', file.name);
      },
      (error) => {
        reject(error instanceof Error ? error : new Error('Firebase Storage 업로드에 실패했습니다.'));
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          onProgress?.(100, 'success', file.name);
          resolve(url);
        } catch (error) {
          reject(error instanceof Error ? error : new Error('업로드한 자산 URL을 가져오지 못했습니다.'));
        }
      }
    );
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
    await getClientAdminIdToken({ forceRefresh: true });

    const isVideo = VIDEO_MIME_TYPES.includes(file.type);
    onProgress?.(0, isVideo ? 'uploading' : 'processing', file.name);
    const uploadBlob = isVideo ? file : await resizeImage(file, maxWidth, maxHeight, quality);
    const uploadFile =
      uploadBlob instanceof File ? uploadBlob : new File([uploadBlob], file.name, { type: uploadBlob.type || file.type });

    return await uploadViaFirebaseStorage({
      file: uploadFile,
      storagePath,
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
