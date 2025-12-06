/**
 * 이미지 업로드 플러그인
 *
 * Firebase Storage를 사용하여 이미지를 업로드합니다.
 * - 드래그 앤 드롭 지원
 * - 클립보드 붙여넣기 지원
 * - 업로드 진행률 표시
 * - 이미지 최적화 (리사이즈, 압축)
 */

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  type UploadTaskSnapshot,
} from 'firebase/storage';
import { storage, auth, initializeFirebase } from '@/lib/firebase';
import { upload, uploadConfig, type Uploader } from '@milkdown/kit/plugin/upload';
import type { Node } from '@milkdown/kit/prose/model';
import type { MilkdownPlugin } from '@milkdown/kit/ctx';

/**
 * 업로드 상태 타입
 */
export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

/**
 * 업로드 진행률 콜백 타입
 */
export type UploadProgressCallback = (
  progress: number,
  status: UploadStatus,
  fileName?: string
) => void;

/**
 * 업로드 설정 인터페이스
 */
export interface ImageUploadConfig {
  /** 최대 파일 크기 (바이트) - 기본값: 10MB */
  maxFileSize?: number;
  /** 허용된 MIME 타입 */
  allowedTypes?: string[];
  /** 업로드 경로 프리픽스 */
  storagePath?: string;
  /** 이미지 리사이즈 최대 너비 */
  maxWidth?: number;
  /** 이미지 리사이즈 최대 높이 */
  maxHeight?: number;
  /** JPEG 품질 (0-1) */
  quality?: number;
  /** 진행률 콜백 */
  onProgress?: UploadProgressCallback;
  /** 에러 콜백 */
  onError?: (error: Error) => void;
}

/**
 * 기본 업로드 설정
 */
const defaultConfig: Required<Omit<ImageUploadConfig, 'onProgress' | 'onError'>> = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  storagePath: 'images/blog', // Firebase Storage 규칙에 맞게 /images 하위 경로 사용
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.85,
};

/**
 * 고유한 파일명 생성
 */
function generateUniqueFileName(originalName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split('.').pop() || 'jpg';
  const baseName = originalName.replace(/\.[^/.]+$/, '').substring(0, 20);
  const sanitizedName = baseName.replace(/[^a-zA-Z0-9가-힣]/g, '_');

  return `${sanitizedName}_${timestamp}_${random}.${extension}`;
}

/**
 * 이미지 리사이즈 및 압축
 */
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

      // 비율 유지하며 리사이즈
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

/**
 * Firebase Storage에 이미지 업로드
 */
export async function uploadImageToFirebase(
  file: File,
  config: ImageUploadConfig = {}
): Promise<string> {
  // Firebase 초기화 확인
  if (typeof window !== 'undefined') {
    initializeFirebase();
  }

  // 인증 상태 확인 - Firebase Storage 규칙에서 인증된 사용자만 업로드 허용
  const currentUser = auth?.currentUser;
  if (!currentUser) {
    const error = new Error('이미지를 업로드하려면 로그인이 필요합니다.');
    config.onError?.(error);
    throw error;
  }

  // 인증 토큰 갱신 (만료된 토큰 문제 방지)
  try {
    await currentUser.getIdToken(true);
  } catch (tokenError) {
    console.error('토큰 갱신 실패:', tokenError);
  }

  const mergedConfig = { ...defaultConfig, ...config };
  const { maxFileSize, allowedTypes, storagePath, maxWidth, maxHeight, quality, onProgress, onError } =
    mergedConfig;

  // 파일 타입 검증
  if (!allowedTypes.includes(file.type)) {
    const error = new Error(`지원하지 않는 파일 형식입니다: ${file.type}`);
    onError?.(error);
    throw error;
  }

  // 파일 크기 검증
  if (file.size > maxFileSize) {
    const maxSizeMB = (maxFileSize / (1024 * 1024)).toFixed(1);
    const error = new Error(`파일 크기가 ${maxSizeMB}MB를 초과합니다`);
    onError?.(error);
    throw error;
  }

  try {
    // 이미지 리사이즈
    onProgress?.(0, 'uploading', file.name);
    const resizedBlob = await resizeImage(file, maxWidth, maxHeight, quality);

    // 파일명 생성
    const fileName = generateUniqueFileName(file.name);
    const filePath = `${storagePath}/${fileName}`;

    // Storage 참조 생성
    const storageRef = ref(storage, filePath);

    // 업로드 시작
    const uploadTask = uploadBytesResumable(storageRef, resizedBlob, {
      contentType: file.type,
      customMetadata: {
        originalName: file.name,
        uploadedAt: new Date().toISOString(),
      },
    });

    // 업로드 진행률 모니터링
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

/**
 * Milkdown 업로더 생성
 */
export function createFirebaseUploader(config: ImageUploadConfig = {}): Uploader {
  return async (files, schema) => {
    const images: File[] = [];

    // 이미지 파일만 필터링
    for (let i = 0; i < files.length; i++) {
      const file = files.item(i);
      if (file && file.type.startsWith('image/')) {
        images.push(file);
      }
    }

    // 각 이미지 업로드 및 노드 생성
    const nodes: Node[] = await Promise.all(
      images.map(async (image) => {
        try {
          const src = await uploadImageToFirebase(image, config);
          const alt = image.name.replace(/\.[^/.]+$/, '');

          return schema.nodes.image.createAndFill({
            src,
            alt,
            title: alt,
          }) as Node;
        } catch (error) {
          console.error('이미지 업로드 실패:', error);
          // 업로드 실패 시 플레이스홀더 이미지 반환
          return schema.nodes.image.createAndFill({
            src: '',
            alt: `업로드 실패: ${image.name}`,
          }) as Node;
        }
      })
    );

    return nodes.filter(Boolean);
  };
}

/**
 * 이미지 업로드 플러그인 설정 함수
 *
 * @param config - 업로드 설정
 * @returns Milkdown 설정 함수
 */
export function configureImageUpload(config: ImageUploadConfig = {}) {
  return (ctx: any) => {
    ctx.update(uploadConfig.key, (prev: any) => ({
      ...prev,
      uploader: createFirebaseUploader(config),
    }));
  };
}

/**
 * 이미지 업로드 플러그인
 *
 * 기본 설정으로 사용할 수 있는 플러그인 인스턴스
 */
export const imageUploadPlugin: MilkdownPlugin[] = upload;

export default imageUploadPlugin;
