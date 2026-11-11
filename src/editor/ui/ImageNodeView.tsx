// 이미지 노드 뷰 (재건 3단계 D11 3·7·9, 5단계 D13)
// - 업로드 중: blob 미리보기 위에 진행률. 실패하면 "다시 시도"·"삭제".
// - 선택하면 작은 메뉴: 대체 텍스트, 캡션(title), 폭(px)·정렬(5단계 D13).
// - 크기(작게·보통·크게 = 변형 파일 고르기, 3단계 D11 9)는 지웠다(main 병합 준비 작업 문서 6.6, 사용자 결정 2026-11-12).
//   화면 크기를 바꾸지 않아 오해를 샀다. 이미지는 최대 변형으로 넣고, 공개 페이지가 srcset으로 기기에 맞는 파일을 고른다.
//   크기는 폭(px) 입력과 데스크톱 가장자리 끌기로 정한다.
// - 영상 주소(.webm·.mp4·.mov, 쿼리가 붙은 Firebase 주소 포함)는 공개 페이지와 같이 <video>로 그린다.
// - uploadId 없이 src가 blob:인 노드(복사해 붙여넣은 자리표시)는 저장을 막는다. 지우기 버튼을 보인다(리뷰 6.2 지적 2).
// - 폭·정렬(5단계 D13): 이미지만 있는 단락(isSoloImageAt)에서만 켠다. legacy·외부 이미지에도 된다. 영상은 끈다.
//   화면 표시는 단락 데코레이션(image-layout.ts)과 editor.css가 맡는다. 노드 뷰는 래퍼에 폭 CSS 변수만 둔다.
//   데스크톱은 가장자리 손잡이를 끌어 폭을 바꾼다(10px 단위, 최대 본문 폭). 끄는 동안 화면 폭만 바꾸고 놓을 때 한 번 저장한다.
// - 돌리기(이미지 회전·좌우반전 작업, 사용자 결정 2026-11-12): 왼쪽 90° · 오른쪽 90° · 좌우반전.
//   서버가 돌린 새 자산을 만들고(원본은 그대로) src만 바꾼다. 새로 올린 이미지만 된다(image-transform.ts).
//   기다리는 동안 단추를 끈다. 실패하면 메뉴에 글자로 알린다.

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { adminApi } from '@/editor/state/api';
import type { TransformOp } from '@/lib/asset-transform';
import {
  IMAGE_WIDTH_MAX,
  IMAGE_WIDTH_MIN,
  normalizeImageAlign,
  normalizeImageWidth,
  type ImageAlign,
} from '@/editor/markdown/image-html';
import { canRetryUpload } from '@/editor/upload/paste-drop';
import { isVideoUrl } from '@/lib/content/markdown';
import { classNames } from './class-names';
import {
  dragDelta,
  dragImageWidth,
  setImageAttrsKeepingSelection,
  soloImageStateAt,
  type SoloImageState,
} from './image-layout';
import {
  imageTransformTargetOf,
  replaceImageSrcKeepingSelection,
  transformPreviewCss,
} from './image-transform';
import { commitFocusedInputIn, selectNodeWithoutFocus } from './touch-select';

// 정렬 버튼. 왼쪽은 기본값(null)이다
const ALIGNS: Array<{ value: ImageAlign | null; label: string }> = [
  { value: null, label: '왼쪽' },
  { value: 'center', label: '가운데' },
  { value: 'right', label: '오른쪽' },
];

// 돌리기 버튼 (사용자 결정 2026-11-12). 기호는 화면 낭독기가 읽지 않는다
const TRANSFORMS: Array<{ op: TransformOp; icon: string; label: string; title: string }> = [
  { op: 'rotate-left', icon: '↺', label: '왼쪽 90°', title: '왼쪽으로 90° 돌리기' },
  { op: 'rotate-right', icon: '↻', label: '오른쪽 90°', title: '오른쪽으로 90° 돌리기' },
  { op: 'flip-horizontal', icon: '⇆', label: '좌우반전', title: '좌우로 뒤집기' },
];

// 이 블로그의 Storage 버킷. 이 버킷의 새 자산만 돌린다
const STORAGE_BUCKET = String(import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET ?? '');

// 새 주소의 그림을 미리 받는다. src를 바꿀 때 빈 칸이 깜빡이지 않게 한다
// - 실패하거나 5초가 지나도 끝낸다(그래도 src는 바꾼다).
function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    const done = () => resolve();
    image.onload = done;
    image.onerror = done;
    window.setTimeout(done, 5000);
    image.src = url;
  });
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

  // 끄는 동안의 화면 폭. 놓으면 null로 돌아가고 노드 속성이 폭을 정한다
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  // 돌리는 중인 단추와 실패 알림
  const [transforming, setTransforming] = useState<TransformOp | null>(null);
  // 기다리는 동안 그림에 두는 CSS transform(미리 돌려 보이기). 저장하지 않는다
  const [transformPreview, setTransformPreview] = useState<string | null>(null);
  const [transformError, setTransformError] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const menuRef = useRef<HTMLSpanElement>(null);
  // 네이티브 리스너가 읽는 최신 값
  const latestRef = useRef({ editor, getPos });
  latestRef.current = { editor, getPos };

  // 터치로 이미지를 누르면 ProseMirror에 넘기지 않고 포커스 없이 노드 선택만 둔다(main 병합 준비 작업 문서 6.5)
  // - ProseMirror가 받으면 에디터에 포커스를 두고 이미지·메뉴를 감싼 DOM 선택 범위를 만든다. iOS는 그 범위를 칠하고
  //   범위 안의 첫 탭을 페이지에 보내지 않았다. 마우스(데스크톱)는 지금처럼 ProseMirror가 받는다.
  // - 리스너는 요소에 직접 단다. React 이벤트는 루트에서 받으므로 ProseMirror보다 늦다(ResizeHandle과 같은 이유).
  // - mousedown 기본 동작을 막으면 브라우저가 편집 루트에 포커스를 주지 않는다.
  useEffect(() => {
    const media: HTMLElement | null = imageRef.current ?? videoRef.current;
    if (!media) return;
    let touch = false;
    const onPointerDown = (event: PointerEvent) => {
      touch = event.pointerType === 'touch' || event.pointerType === 'pen';
    };
    const onMouseDown = (event: MouseEvent) => {
      const { editor: current, getPos: positionOf } = latestRef.current;
      if (!touch || !current.isEditable) return;
      const pos = positionOf();
      if (typeof pos !== 'number') return;
      event.preventDefault();
      event.stopPropagation();
      selectNodeWithoutFocus(current.view, pos, {
        activeElement: document.activeElement,
        selection: window.getSelection(),
      });
    };
    media.addEventListener('pointerdown', onPointerDown);
    media.addEventListener('mousedown', onMouseDown);
    return () => {
      media.removeEventListener('pointerdown', onPointerDown);
      media.removeEventListener('mousedown', onMouseDown);
    };
  }, [isVideo]);

  // 복사해 붙여넣은 자리표시: 올릴 파일 정보가 없다
  const strayBlob = !uploadId && src.startsWith('blob:');
  const showMenu = selected && !uploadId && !strayBlob && editor.isEditable;

  // 메뉴 안을 누를 때 포커스를 옮기지 않는다(입력 칸은 제외). ProseMirror에도 넘기지 않는다(6.5)
  // - iOS는 메뉴 단추를 누르면 편집 루트에 포커스를 줬다. 그러면 노드 선택의 DOM 범위가 다시 생겼다.
  // - 입력 칸의 값은 단추 처리 전에 commitPendingInput이 반영한다.
  // - showMenu가 바뀌면 메뉴 요소가 생기거나 사라지므로 다시 단다.
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as { tagName?: string } | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      event.preventDefault();
      event.stopPropagation();
    };
    menu.addEventListener('mousedown', onMouseDown);
    return () => menu.removeEventListener('mousedown', onMouseDown);
  }, [showMenu]);

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
  // 돌리기: 새로 올린 이미지만. 영상·옛 이미지·외부 이미지는 끄고 이유를 보인다
  const transformTarget = isVideo ? null : imageTransformTargetOf(src, STORAGE_BUCKET);
  const transformAssetId = transformTarget?.kind === 'asset' ? transformTarget.assetId : null;
  const transformDisabledReason = isVideo
    ? '영상은 돌릴 수 없습니다'
    : transformTarget?.kind === 'legacy'
      ? '옛 이미지는 돌릴 수 없습니다'
      : transformTarget?.kind === 'external'
        ? '이 블로그에 올린 이미지만 돌릴 수 있습니다'
        : undefined;

  // 메뉴가 닫히거나 이미지가 바뀌면 실패 알림을 지운다
  useEffect(() => {
    setTransformError(null);
  }, [src, showMenu]);

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

  // 메뉴 단추를 처리하기 전에 입력 중인 칸을 반영한다(6.5). 단추가 포커스를 옮기지 않아 blur가 먼저 오지 않는다
  // - 반영하는 동안만 "메뉴 안" 표시를 켠다. 그래야 반영이 이미지 선택을 지키고, 나중의 바깥 blur는 바깥으로 본다.
  const commitPendingInput = () => {
    const previous = menuPointerRef.current;
    commitFocusedInputIn(menuRef.current, document.activeElement, () => {
      menuPointerRef.current = true;
    });
    menuPointerRef.current = previous;
  };

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

  // 돌리기: 서버가 돌린 자산을 받아 src를 바꾼다(되돌리기 한 번, 메뉴는 열린 채)
  // - 입력 중인 칸을 먼저 반영한다(단추가 포커스를 옮기지 않는다, 6.5).
  // - 누르면 바로 그림을 CSS로 돌려 보인다(transformPreviewCss). 서버가 파일을 만드는 몇 초를 기다리지 않게 한다.
  //   src를 바꿀 때 같은 렌더에서 지운다. 실패해도 지운다.
  // - 기다리는 동안 src가 바뀌었으면(되돌리기 등) 바꾸지 않는다. 위치는 끝난 때 다시 읽는다.
  const runTransform = async (op: TransformOp) => {
    if (!transformAssetId || transforming) return;
    commitPendingInput();
    const fromSrc = src;
    const image = imageRef.current;
    setTransforming(op);
    setTransformPreview(transformPreviewCss(op, image?.naturalWidth ?? 0, image?.naturalHeight ?? 0));
    setTransformError(null);
    try {
      const { asset } = await adminApi.transformAsset(transformAssetId, op);
      await preloadImage(asset.url);
      const { editor: current, getPos: positionOf } = latestRef.current;
      const pos = positionOf();
      if (typeof pos !== 'number' || current.isDestroyed) return;
      current.commands.command(({ tr }) =>
        replaceImageSrcKeepingSelection(tr, pos, fromSrc, asset.url),
      );
    } catch (error) {
      setTransformError(error instanceof Error ? error.message : '이미지를 돌리지 못했습니다.');
    } finally {
      setTransforming(null);
      setTransformPreview(null);
    }
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
          ref={videoRef}
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
          className={classNames('rounded-lg', transformPreview && 'editor-image-transform-preview')}
          style={transformPreview ? { transform: transformPreview } : undefined}
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
          ref={menuRef}
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
                onClick={() => {
                  commitPendingInput();
                  if (align !== option.value) updateKeepingSelection({ align: option.value });
                }}
              >
                {option.label}
              </button>
            ))}
          </span>
          <span
            className="flex items-center gap-1 text-xs text-text-secondary"
            role="group"
            aria-label="돌리기"
          >
            <span className="w-10 shrink-0">돌리기</span>
            {TRANSFORMS.map((item) => (
              <button
                key={item.op}
                type="button"
                className="editor-chip"
                disabled={!transformAssetId || transforming !== null}
                aria-busy={transforming === item.op}
                title={transformDisabledReason ?? item.title}
                onClick={() => void runTransform(item.op)}
              >
                <span aria-hidden="true">{item.icon}</span>{' '}
                {transforming === item.op ? '돌리는 중…' : item.label}
              </button>
            ))}
          </span>
          {transformError && (
            <span className="editor-image-note" role="alert">
              {transformError}
            </span>
          )}
          {/* 돌리기를 끈 이유도 글자로 보인다(터치 기기는 title을 읽기 어렵다) */}
          {!transformAssetId && transformDisabledReason && (
            <span className="editor-image-note" role="note">
              {transformDisabledReason}
            </span>
          )}
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
