// 이미지 노드 뷰 (재건 3단계 D11 3·7·9)
// - 업로드 중: blob 미리보기 위에 진행률. 실패하면 "다시 시도"·"삭제".
// - 선택하면 작은 메뉴: 대체 텍스트, 캡션(title), 크기(작게·보통·크게).
// - 크기 메뉴는 주소가 우리 버킷의 새 자산(assets/{id}/)일 때만 켠다. GET /api/admin/assets/{id}로 있는 변형을 확인한다.
//   legacy 이미지(images/…)와 외부 주소는 메뉴가 비활성이다.
// - 영상 주소(.webm·.mp4·.mov, 쿼리가 붙은 Firebase 주소 포함)는 공개 페이지와 같이 <video>로 그린다.
// - uploadId 없이 src가 blob:인 노드(복사해 붙여넣은 자리표시)는 저장을 막는다. 지우기 버튼을 보인다(리뷰 6.2 지적 2).

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { adminApi } from '@/editor/state/api';
import { canRetryUpload } from '@/editor/upload/paste-drop';
import {
  IMAGE_SIZE_LABELS,
  sizeOfUrl,
  variantUrlFor,
  type ImageSize,
  type UploadedAsset,
} from '@/editor/upload/image-size';
import { assetIdFromUrl } from '@/lib/asset-url';
import { isVideoUrl } from '@/lib/content/markdown';
import { classNames } from './class-names';

const BUCKET = (import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET as string | undefined) ?? '';
const SIZES: ImageSize[] = ['small', 'medium', 'large'];

// 자산 문서는 글 하나를 여는 동안 한 번만 읽는다
const assetCache = new Map<string, Promise<UploadedAsset>>();

function fetchAsset(id: string): Promise<UploadedAsset> {
  let pending = assetCache.get(id);
  if (!pending) {
    pending = adminApi.getAsset(id).then((response) => response.asset);
    pending.catch(() => assetCache.delete(id));
    assetCache.set(id, pending);
  }
  return pending;
}

// 속성 하나를 고치는 입력 칸. 포커스를 잃거나 Enter를 누르면 반영한다. 값이 같으면 문서를 건드리지 않는다(D1 b)
function AttrInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="flex items-center gap-1 text-xs text-text-secondary">
      <span className="w-10 shrink-0">{label}</span>
      <input
        className="w-40 rounded-sm border border-border bg-bg-app px-1.5 py-0.5 text-xs text-text-primary"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => draft !== value && onCommit(draft)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (draft !== value) onCommit(draft);
          }
        }}
      />
    </label>
  );
}

export function ImageNodeView({
  node,
  selected,
  updateAttributes,
  deleteNode,
  editor,
}: NodeViewProps) {
  const src = String(node.attrs.src ?? '');
  const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : '';
  const title = typeof node.attrs.title === 'string' ? node.attrs.title : '';
  const uploadId = typeof node.attrs.uploadId === 'string' ? node.attrs.uploadId : null;
  const progress = typeof node.attrs.uploadProgress === 'number' ? node.attrs.uploadProgress : null;
  const uploadError = typeof node.attrs.uploadError === 'string' ? node.attrs.uploadError : null;

  const assetId = uploadId || !BUCKET ? null : assetIdFromUrl(src, BUCKET);
  const [asset, setAsset] = useState<UploadedAsset | null>(null);
  const [assetFailed, setAssetFailed] = useState(false);

  // 선택했을 때만 자산 문서를 읽는다
  useEffect(() => {
    if (!selected || !assetId || asset?.id === assetId) return;
    let cancelled = false;
    fetchAsset(assetId)
      .then((loaded) => {
        if (!cancelled) setAsset(loaded);
      })
      .catch(() => {
        if (!cancelled) setAssetFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, assetId, asset?.id]);

  const currentSize = asset ? sizeOfUrl(asset, src) : null;
  // 복사해 붙여넣은 자리표시: 올릴 파일 정보가 없다
  const strayBlob = !uploadId && src.startsWith('blob:');
  const showMenu = selected && !uploadId && !strayBlob && editor.isEditable;

  return (
    <NodeViewWrapper
      as="span"
      // 클래스는 배열로 잇는다. prettier-plugin-tailwindcss가 템플릿 문자열 조각의 앞 공백을 지우기 때문이다(리뷰 6.2 지적 9)
      className={classNames(
        'editor-image',
        selected && 'is-selected',
        (uploadId || strayBlob) && 'is-uploading',
      )}
      data-drag-handle
    >
      {isVideoUrl(src) ? (
        <video
          src={src}
          muted
          playsInline
          loop
          autoPlay
          className="rounded-lg"
          title={alt || undefined}
        />
      ) : (
        <img
          src={src}
          alt={alt}
          title={title || undefined}
          className="rounded-lg"
          draggable={false}
        />
      )}

      {uploadId && (
        <span className="editor-image-overlay" contentEditable={false}>
          {uploadError ? (
            <>
              <span className="editor-image-error">업로드 실패 · {uploadError}</span>
              <span className="flex gap-2">
                {canRetryUpload(uploadId) && (
                  <button
                    type="button"
                    className="editor-chip"
                    onClick={() => editor.commands.retryImageUpload(uploadId)}
                  >
                    다시 시도
                  </button>
                )}
                <button
                  type="button"
                  className="editor-chip editor-chip-danger"
                  onClick={() => editor.commands.cancelImageUpload(uploadId)}
                >
                  삭제
                </button>
              </span>
            </>
          ) : (
            <>
              <span>업로드 중 {progress ?? 0}%</span>
              <progress className="editor-image-progress" value={progress ?? 0} max={100} />
            </>
          )}
        </span>
      )}

      {strayBlob && (
        <span className="editor-image-overlay" contentEditable={false}>
          <span className="editor-image-error">
            업로드되지 않은 이미지입니다. 지우고 다시 올리세요.
          </span>
          <button
            type="button"
            className="editor-chip editor-chip-danger"
            onClick={() => deleteNode()}
          >
            삭제
          </button>
        </span>
      )}

      {showMenu && (
        <span className="editor-image-menu" contentEditable={false}>
          <AttrInput
            label="대체"
            value={alt}
            onCommit={(next) => updateAttributes({ alt: next })}
          />
          <AttrInput
            label="캡션"
            value={title}
            onCommit={(next) => updateAttributes({ title: next || null })}
          />
          <span className="flex items-center gap-1 text-xs text-text-secondary">
            <span className="w-10 shrink-0">크기</span>
            {SIZES.map((size) => {
              const url = asset ? variantUrlFor(asset, size) : null;
              const disabled = !url;
              return (
                <button
                  key={size}
                  type="button"
                  className={classNames('editor-chip', currentSize === size && 'is-active')}
                  disabled={disabled}
                  title={
                    !assetId
                      ? '외부 주소나 옛 이미지는 크기를 고를 수 없습니다'
                      : assetFailed
                        ? '자산 정보를 읽지 못했습니다'
                        : disabled
                          ? '이 크기의 변형이 없습니다'
                          : undefined
                  }
                  onClick={() => url && updateAttributes({ src: url })}
                >
                  {IMAGE_SIZE_LABELS[size]}
                </button>
              );
            })}
          </span>
        </span>
      )}
    </NodeViewWrapper>
  );
}
