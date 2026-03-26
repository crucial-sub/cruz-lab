/**
 * 이미지 업로드 플러그인
 *
 * Firebase Storage를 사용하여 이미지를 업로드합니다.
 * - 드래그 앤 드롭 지원
 * - 클립보드 붙여넣기 지원
 * - 업로드 진행률 표시
 * - 이미지 최적화 (리사이즈, 압축)
 */
import { upload, uploadConfig, type Uploader } from '@milkdown/kit/plugin/upload';
import type { Node } from '@milkdown/kit/prose/model';
import type { MilkdownPlugin } from '@milkdown/kit/ctx';
import type { ImageUploadConfig, UploadStatus } from '../upload-types';
import { generateLQIP, uploadImageToFirebase } from '../media-upload-client';

export type { ImageUploadConfig, UploadStatus };
export { generateLQIP, uploadImageToFirebase };

/**
 * Milkdown 업로더 생성
 * 이미지와 동영상 파일 모두 지원
 */
export function createFirebaseUploader(config: ImageUploadConfig = {}): Uploader {
  return async (files, schema) => {
    const mediaFiles: File[] = [];

    // 이미지 및 동영상 파일 필터링
    for (let i = 0; i < files.length; i++) {
      const file = files.item(i);
      if (file && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
        mediaFiles.push(file);
      }
    }

    // 각 미디어 파일 업로드 및 노드 생성
    // 동영상은 마크다운 이미지 문법으로 삽입 (공개 포스트 렌더러가 video 태그로 변환함)
    const nodes: Node[] = await Promise.all(
      mediaFiles.map(async (mediaFile) => {
        try {
          const src = await uploadImageToFirebase(mediaFile, config);
          const alt = mediaFile.name.replace(/\.[^/.]+$/, '');

          // 이미지 노드로 생성 (동영상도 마크다운에서는 이미지 문법 사용)
          return schema.nodes.image.createAndFill({
            src,
            alt,
            title: alt,
          }) as Node;
        } catch (error) {
          console.error('미디어 업로드 실패:', error);
          // 업로드 실패 시 플레이스홀더 반환
          return schema.nodes.image.createAndFill({
            src: '',
            alt: `업로드 실패: ${mediaFile.name}`,
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
