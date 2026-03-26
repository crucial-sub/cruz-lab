import type { UploadTaskSnapshot } from 'firebase/storage';
import { getClientAuth } from '@/lib/firebase-auth-client';
import { getClientStorage } from '@/lib/firebase-storage-client';
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

function generateUniqueFileName(originalName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split('.').pop() || 'jpg';
  const baseName = originalName.replace(/\.[^/.]+$/, '').substring(0, 20);
  const sanitizedName = baseName.replace(/[^a-zA-Z0-9가-힣]/g, '_');

  return `${sanitizedName}_${timestamp}_${random}.${extension}`;
}

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

export async function uploadImageToFirebase(
  file: File,
  config: ImageUploadConfig = {}
): Promise<string> {
  const currentUser = getClientAuth().currentUser;
  if (!currentUser) {
    const error = new Error('이미지를 업로드하려면 로그인이 필요합니다.');
    config.onError?.(error);
    throw error;
  }

  try {
    await currentUser.getIdToken(true);
  } catch (tokenError) {
    console.error('토큰 갱신 실패:', tokenError);
  }

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
    onProgress?.(0, 'uploading', file.name);

    const isVideo = VIDEO_MIME_TYPES.includes(file.type);
    const uploadBlob = isVideo ? file : await resizeImage(file, maxWidth, maxHeight, quality);
    const fileName = generateUniqueFileName(file.name);
    const filePath = `${storagePath}/${fileName}`;

    const { ref, uploadBytesResumable, getDownloadURL } = await import('firebase/storage');
    const storage = getClientStorage();
    const storageRef = ref(storage, filePath);

    const uploadTask = uploadBytesResumable(storageRef, uploadBlob, {
      contentType: file.type,
      customMetadata: {
        originalName: file.name,
        uploadedAt: new Date().toISOString(),
      },
    });

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot: UploadTaskSnapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress?.(progress, 'uploading', file.name);
        },
        (error) => {
          onProgress?.(0, 'error', file.name);
          onError?.(error);
          reject(error);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            onProgress?.(100, 'success', file.name);
            resolve(downloadURL);
          } catch (error) {
            onProgress?.(0, 'error', file.name);
            onError?.(error as Error);
            reject(error);
          }
        }
      );
    });
  } catch (error) {
    onProgress?.(0, 'error', file.name);
    onError?.(error as Error);
    throw error;
  }
}
