// 이미지 노드 뷰 (재건 3단계 D11 3·7·9, 5단계 D13)
// - 업로드 중: blob 미리보기 위에 진행률. 실패하면 "다시 시도"·"삭제".
// - 선택하면 작은 메뉴: 대체 텍스트, 캡션(title), 크기(작게·보통·크게), 폭(px)·정렬(5단계 D13).
// - 크기 메뉴는 주소가 우리 버킷의 새 자산(assets/{id}/)일 때만 켠다. GET /api/admin/assets/{id}로 있는 변형을 확인한다.
//   legacy 이미지(images/…)와 외부 주소는 메뉴가 비활성이다.
// - 영상 주소(.webm·.mp4·.mov, 쿼리가 붙은 Firebase 주소 포함)는 공개 페이지와 같이 <video>로 그린다.
// - uploadId 없이 src가 blob:인 노드(복사해 붙여넣은 자리표시)는 저장을 막는다. 지우기 버튼을 보인다(리뷰 6.2 지적 2).
// - 폭·정렬(5단계 D13): 이미지만 있는 단락(isSoloImageAt)에서만 켠다. legacy·외부 이미지에도 된다. 영상은 끈다.
//   화면 표시는 단락 데코레이션(image-layout.ts)과 editor.css가 맡는다. 노드 뷰는 래퍼에 폭 CSS 변수만 둔다.
//   데스크톱은 가장자리 손잡이를 끌어 폭을 바꾼다(10px 단위, 최대 본문 폭). 끄는 동안 화면 폭만 바꾸고 놓을 때 한 번 저장한다.

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  IMAGE_WIDTH_MAX,
  IMAGE_WIDTH_MIN,
  normalizeImageAlign,
  normalizeImageWidth,
  type ImageAlign,
} from '@/editor/markdown/image-html';
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
import {
  dragDelta,
  dragImageWidth,
  setImageAttrsKeepingSelection,
  soloImageStateAt,
  type SoloImageState,
} from './image-layout';

const BUCKET = (import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET as string | undefined) ?? '';
const SIZES: ImageSize[] = ['small', 'medium', 'large'];
// 정렬 버튼. 왼쪽은 기본값(null)이다
const ALIGNS: Array<{ value: ImageAlign | null; label: string }> = [
  { value: null, label: '왼쪽' },
  { value: 'center', label: '가운데' },
  { value: 'right', label: '오른쪽' },
];

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

// 입력을 반영한 방법
// - enter: Enter를 눌렀다. menu: 포커스가 같은 메뉴의 다른 칸·버튼으로 갔다. 이 둘은 이미지 선택을 지킨다(메뉴가 닫히지 않는다).
// - blur: 포커스가 메뉴 밖으로 갔다. 사용자가 다른 곳을 고른 것이므로 선택을 되돌리지 않는다
type CommitVia = 'enter' | 'menu' | 'blur';

// 속성 하나를 고치는 입력 칸. 포커스를 잃거나 Enter를 누르면 반영한다. 값이 같으면 문서를 건드리지 않는다(D1 b)
// - onCommit이 false를 돌려주면(받지 않는 값) 입력을 지금 값으로 되돌린다
function AttrInput({
  label,
  value,
  onCommit,
  placeholder,
  disabled,
  title,
  narrow,
  pointerInMenu,
}: {
  label: string;
  value: string;
  onCommit: (next: string, via: CommitVia) => boolean | void;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  // 폭 입력처럼 짧은 값을 받는 칸
  narrow?: boolean;
  // 메뉴 안을 누르는 중인지. 맥 Safari·Firefox는 단추를 눌러도 단추에 포커스를 주지 않아
  // relatedTarget이 비므로 이것으로 "메뉴 안으로 옮김"을 안다(리뷰 B4)
  pointerInMenu?: () => boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (via: CommitVia) => {
    if (draft === value) return;
    if (onCommit(draft, via) === false) setDraft(value);
  };
  return (
    <label className="flex items-center gap-1 text-xs text-text-secondary" title={title}>
      <span className="w-10 shrink-0">{label}</span>
      <input
        className={classNames(
          'rounded-sm border border-border bg-bg-app px-1.5 py-0.5 text-xs text-text-primary disabled:opacity-40',
          narrow ? 'w-16' : 'w-40',
        )}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        inputMode={narrow ? 'numeric' : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          const menu = event.currentTarget.closest('.editor-image-menu');
          const next = event.relatedTarget;
          const intoMenu =
            (menu && next instanceof Node && menu.contains(next)) || pointerInMenu?.() === true;
          commit(intoMenu ? 'menu' : 'blur');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit('enter');
          }
        }}
      />
    </label>
  );
}

// 이만큼(px) 움직여야 끌기로 본다. 손잡이를 누르기만 하면 폭을 저장하지 않는다
const DRAG_THRESHOLD = 3;

// 끌기를 시작할 때 재는 값: 지금 그려진 폭과 최대 폭(본문 폭)
interface DragStart {
  width: number;
  max: number;
}

// 폭 손잡이 (데스크톱). 포인터 캡처로 끈다
// - 이벤트는 손잡이 요소에 직접 단다. ProseMirror가 편집 영역에서 mousedown을 받기 전에 막아야 노드 끌기·선택이 시작되지 않는다
//   (React 이벤트는 루트에서 받으므로 ProseMirror보다 늦다).
// - 끄는 동안 onPreview로 화면 폭만 알린다. 놓으면 onCommit 한 번, 취소되면 onCancel이다
function ResizeHandle({
  side,
  align,
  measure,
  onPreview,
  onCommit,
  onCancel,
}: {
  side: 'left' | 'right';
  align: ImageAlign | null;
  measure: () => DragStart | null;
  onPreview: (width: number) => void;
  onCommit: (width: number) => void;
  onCancel: () => void;
}) {
  const handleRef = useRef<HTMLSpanElement>(null);
  // 리스너는 한 번만 단다. 최신 값은 ref로 읽는다
  const latest = useRef({ align, measure, onPreview, onCommit, onCancel });
  useEffect(() => {
    latest.current = { align, measure, onPreview, onCommit, onCancel };
  });

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    let drag: {
      pointerId: number;
      startX: number;
      start: DragStart;
      width: number;
      moved: boolean;
    } | null = null;

    // 끝내기: commit이면 마지막 폭을 저장한다. 움직이지 않았으면 저장하지 않는다
    const finish = (pointerId: number, commit: boolean) => {
      if (!drag || drag.pointerId !== pointerId) return;
      const { width, moved } = drag;
      drag = null;
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      if (commit && moved) latest.current.onCommit(width);
      else latest.current.onCancel();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const start = latest.current.measure();
      if (!start) return;
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture(event.pointerId);
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        start,
        width: dragImageWidth(start.width, 0, start.max),
        moved: false,
      };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      const dx = event.clientX - drag.startX;
      if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
      const width = dragImageWidth(
        drag.start.width,
        dragDelta(dx, latest.current.align),
        drag.start.max,
      );
      if (width === drag.width && drag.moved) return;
      drag.width = width;
      drag.moved = true;
      latest.current.onPreview(width);
    };
    const onPointerUp = (event: PointerEvent) => finish(event.pointerId, true);
    const onPointerCancel = (event: PointerEvent) => finish(event.pointerId, false);
    // ProseMirror의 mousedown(노드 끌기 준비)과 브라우저 끌기를 막는다
    const swallow = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp);
    handle.addEventListener('pointercancel', onPointerCancel);
    handle.addEventListener('lostpointercapture', onPointerCancel);
    handle.addEventListener('mousedown', swallow);
    handle.addEventListener('dragstart', swallow);
    return () => {
      // 끄는 중에 손잡이가 사라지면(선택이 풀림 등) 화면 폭을 되돌린다
      if (drag) {
        drag = null;
        latest.current.onCancel();
      }
      handle.removeEventListener('pointerdown', onPointerDown);
      handle.removeEventListener('pointermove', onPointerMove);
      handle.removeEventListener('pointerup', onPointerUp);
      handle.removeEventListener('pointercancel', onPointerCancel);
      handle.removeEventListener('lostpointercapture', onPointerCancel);
      handle.removeEventListener('mousedown', swallow);
      handle.removeEventListener('dragstart', swallow);
    };
  }, []);

  return (
    <span
      ref={handleRef}
      className={classNames('editor-image-resize', side === 'left' && 'is-left')}
      contentEditable={false}
      aria-hidden="true"
      title="끌어서 폭 바꾸기"
    />
  );
}

export function ImageNodeView({
  node,
  selected,
  updateAttributes,
  deleteNode,
  editor,
  getPos,
}: NodeViewProps) {
  const src = String(node.attrs.src ?? '');
  const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : '';
  const title = typeof node.attrs.title === 'string' ? node.attrs.title : '';
  const uploadId = typeof node.attrs.uploadId === 'string' ? node.attrs.uploadId : null;
  const progress = typeof node.attrs.uploadProgress === 'number' ? node.attrs.uploadProgress : null;
  const uploadError = typeof node.attrs.uploadError === 'string' ? node.attrs.uploadError : null;
  const width = normalizeImageWidth(node.attrs.width);
  const align = normalizeImageAlign(node.attrs.align);
  const isVideo = isVideoUrl(src);

  const assetId = uploadId || !BUCKET ? null : assetIdFromUrl(src, BUCKET);
  const [asset, setAsset] = useState<UploadedAsset | null>(null);
  const [assetFailed, setAssetFailed] = useState(false);
  // 끄는 동안의 화면 폭. 놓으면 null로 돌아가고 노드 속성이 폭을 정한다
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

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

  // 이미지만 있는 단락인지. 메뉴는 선택될 때 그리므로 그때 위치로 판정한다
  let soloState: SoloImageState = 'shared';
  if (showMenu) {
    try {
      const pos = getPos();
      if (typeof pos === 'number') soloState = soloImageStateAt(editor.state.doc, pos);
    } catch {
      // 노드 뷰가 문서에서 빠지는 중이면 위치가 없다
      soloState = 'shared';
    }
  }
  const layoutEnabled = soloState === 'solo' && !isVideo;
  const layoutDisabledReason = isVideo
    ? '영상은 폭·정렬을 정할 수 없습니다'
    : soloState === 'blocked'
      ? '표 칸과 할 일의 첫 줄에서는 정할 수 없습니다'
      : soloState === 'shared'
        ? '이미지만 있는 줄에서 정할 수 있습니다'
        : undefined;
  const hasLayout = width !== null || align !== null;
  // 속성은 남아 있지만 저장하지 않는 경우의 알림
  const layoutNote = !hasLayout
    ? null
    : isVideo
      ? '영상에는 폭·정렬을 저장하지 않습니다'
      : soloState === 'blocked'
        ? '이 자리에는 폭·정렬을 저장하지 않습니다'
        : soloState === 'shared'
          ? '이 줄에는 다른 내용이 있어 폭·정렬을 저장하지 않습니다'
          : null;

  // 화면 폭: 끄는 중이면 그 폭, 아니면 속성. 영상은 폭을 두지 않는다
  const shownWidth = isVideo ? null : (dragWidth ?? width);
  const wrapperStyle =
    shownWidth === null
      ? undefined
      : ({ '--editor-image-width': `${shownWidth}px` } as CSSProperties);

  // 메뉴 안을 누르는 중인지(리뷰 B4). pointerdown에서 켜고, 손을 뗀 뒤(그 클릭이 끝난 뒤) 끈다
  const menuPointerRef = useRef(false);
  const markMenuPointer = () => {
    menuPointerRef.current = true;
    window.addEventListener(
      'pointerup',
      () => window.setTimeout(() => (menuPointerRef.current = false), 0),
      { once: true, capture: true },
    );
  };
  const pointerInMenu = () => menuPointerRef.current;

  // 속성을 바꾸고 이미지 선택을 지킨다(메뉴가 닫히지 않게)
  // - updateAttributes는 잎 노드를 바꿔 끼워 선택이 글자 선택으로 풀린다. 같은 트랜잭션에서 노드 선택을 다시 둔다(되돌리기 한 번)
  // - 속성은 지금 문서에서 읽는다(setImageAttrsKeepingSelection). 이 컴포넌트가 그린 때의 node.attrs를 쓰면
  //   iPhone에서 폭 반영과 정렬 click이 다시 그리기 전에 연달아 와 폭이 지워졌다(main 병합 준비 작업 문서 6.2)
  const updateKeepingSelection = (attributes: Record<string, unknown>) => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    editor.commands.command(({ tr }) => setImageAttrsKeepingSelection(tr, pos, attributes));
  };

  // 입력 칸의 값을 반영한다. 포커스가 메뉴 밖으로 갔을 때만 선택을 되돌리지 않는다(CommitVia)
  const commitAttributes = (attributes: Record<string, unknown>, via: CommitVia) => {
    if (via === 'blur') updateAttributes(attributes);
    else updateKeepingSelection(attributes);
  };

  // 폭 입력: 비우면 자동(null). 16~4096 정수가 아니면 받지 않는다
  const commitWidth = (draft: string, via: CommitVia): boolean | void => {
    const trimmed = draft.trim();
    const next = trimmed === '' ? null : normalizeImageWidth(trimmed);
    if ((trimmed !== '' && next === null) || next === width) return false;
    commitAttributes({ width: next }, via);
  };

  // 끌기 시작: 지금 그려진 폭과 본문 폭(편집 영역의 내용 폭)을 잰다
  const measureDrag = (): DragStart | null => {
    const image = imageRef.current;
    if (!image) return null;
    const body = editor.view.dom as HTMLElement;
    const style = window.getComputedStyle(body);
    const max =
      body.clientWidth -
      (Number.parseFloat(style.paddingLeft) || 0) -
      (Number.parseFloat(style.paddingRight) || 0);
    return { width: image.getBoundingClientRect().width, max };
  };

  return (
    <NodeViewWrapper
      as="span"
      // 클래스는 배열로 잇는다. prettier-plugin-tailwindcss가 템플릿 문자열 조각의 앞 공백을 지우기 때문이다(리뷰 6.2 지적 9)
      className={classNames(
        'editor-image',
        selected && 'is-selected',
        (uploadId || strayBlob) && 'is-uploading',
        dragWidth !== null && 'is-resizing',
      )}
      data-drag-handle
      data-width={shownWidth ?? undefined}
      style={wrapperStyle}
    >
      {isVideo ? (
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
          ref={imageRef}
          src={src}
          alt={alt}
          title={title || undefined}
          className="rounded-lg"
          draggable={false}
        />
      )}

      {showMenu && layoutEnabled && (
        <ResizeHandle
          side={align === 'right' ? 'left' : 'right'}
          align={align}
          measure={measureDrag}
          onPreview={setDragWidth}
          onCommit={(next) => {
            updateKeepingSelection({ width: next });
            setDragWidth(null);
          }}
          onCancel={() => setDragWidth(null)}
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
        <span
          className="editor-image-menu"
          contentEditable={false}
          // 누르는 동안 표시를 둔다. 입력 칸의 blur가 이것을 읽는다(리뷰 B4)
          onPointerDownCapture={markMenuPointer}
        >
          <AttrInput
            label="대체"
            value={alt}
            onCommit={(next, via) => commitAttributes({ alt: next }, via)}
            pointerInMenu={pointerInMenu}
          />
          <AttrInput
            label="캡션"
            value={title}
            onCommit={(next, via) => commitAttributes({ title: next || null }, via)}
            pointerInMenu={pointerInMenu}
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
          <AttrInput
            label="폭(px)"
            value={width === null ? '' : String(width)}
            placeholder="자동"
            narrow
            disabled={!layoutEnabled}
            title={
              layoutDisabledReason ??
              `${IMAGE_WIDTH_MIN}~${IMAGE_WIDTH_MAX} 사이 정수입니다. 비우면 자동입니다`
            }
            onCommit={commitWidth}
            pointerInMenu={pointerInMenu}
          />
          <span
            className="flex items-center gap-1 text-xs text-text-secondary"
            role="group"
            aria-label="정렬"
          >
            <span className="w-10 shrink-0">정렬</span>
            {ALIGNS.map((option) => (
              <button
                key={option.label}
                type="button"
                className={classNames('editor-chip', align === option.value && 'is-active')}
                aria-pressed={align === option.value}
                disabled={!layoutEnabled}
                title={layoutDisabledReason}
                onClick={() =>
                  align !== option.value && updateKeepingSelection({ align: option.value })
                }
              >
                {option.label}
              </button>
            ))}
          </span>
          {layoutNote && (
            <span className="editor-image-note" role="note">
              {layoutNote}
            </span>
          )}
          {/* 폭·정렬을 끈 이유를 글자로도 보인다(터치 기기·화면 낭독기는 title을 읽기 어렵다, 리뷰 B12) */}
          {!layoutNote && !layoutEnabled && layoutDisabledReason && (
            <span className="editor-image-note" role="note">
              {layoutDisabledReason}
            </span>
          )}
        </span>
      )}
    </NodeViewWrapper>
  );
}
