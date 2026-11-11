// 드롭·붙여넣기 → 업로드 → 노드 교체 (재건 3단계 D11 1·3·7, 리뷰 6.2 지적 2b·3·4)
// - 파일을 떨어뜨리거나 붙여넣으면 이미지 노드를 src=blob:, uploadId로 넣고 업로드를 시작한다.
// - 진행률은 노드 속성 uploadProgress에, 실패는 uploadError에 적는다. 끝나면 src를 자산 주소로 바꾸고 uploadId를 지운다.
// - 업로드 결과는 uploadId별로 기억한다. 되돌리기·다시 실행으로 노드가 다시 나타나면 appendTransaction이 그 결과를 적용한다.
//   결과도 파일도 없는 노드(정보를 잃은 노드)는 오류로 표시한다. 사용자가 지운다.
// - 업로드가 끝나지 않은 이미지(uploadId가 있거나 src가 blob:)가 하나라도 있으면 자동저장을 멈춘다(countUploadingNodes).
// - 명령은 받은 tr에 단계를 쌓는다. 비동기 갱신(진행률·결과)만 view.dispatch로 따로 보낸다.
// - 붙여넣은 HTML의 원격 <img>는 Tiptap Image의 parseHTML이 주소 그대로 받는다(D11 8). 여기서는 파일만 다룬다.

import { Extension, type Editor } from '@tiptap/core';
import type { Node as PmNode, Schema } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { checkUploadFile, uploadAsset, type UploadTransport } from './upload-client';

export interface ImageUploadOptions {
  transport: UploadTransport | null;
  // 받지 않는 파일(형식·크기)을 알린다
  onReject: (message: string) => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageUpload: {
      // 파일들을 지금 위치(또는 pos)에 넣고 올린다
      insertImageFiles: (files: File[], pos?: number) => ReturnType;
      // 실패한 업로드를 같은 파일로 다시 한다
      retryImageUpload: (uploadId: string) => ReturnType;
      // 업로드를 포기하고 노드를 지운다
      cancelImageUpload: (uploadId: string) => ReturnType;
    };
  }
}

// 정보를 잃은 업로드 노드에 보이는 문구
export const LOST_UPLOAD_MESSAGE = '업로드 정보를 잃었습니다. 이미지를 지우고 다시 올리세요.';

// uploadId별로 기억하는 파일과 blob 주소(다시 시도할 수 있다)
const pendingFiles = new Map<string, { file: File; blobUrl: string }>();
// 지금 올리는 중인 uploadId
const inFlight = new Set<string>();
// 끝난 업로드의 결과. 노드가 다시 나타나면 적용한다
const results = new Map<string, { src: string } | { error: string }>();

// 같은 파일로 다시 시도할 수 있는지
export function canRetryUpload(uploadId: string): boolean {
  return pendingFiles.has(uploadId) && !inFlight.has(uploadId);
}

// 문서에서 uploadId가 같은 이미지 노드의 위치를 찾는다. 없으면 null
export function findUploadNode(
  doc: PmNode,
  uploadId: string,
): { pos: number; node: PmNode } | null {
  let found: { pos: number; node: PmNode } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === 'image' && node.attrs.uploadId === uploadId) {
      found = { pos, node };
      return false;
    }
    return true;
  });
  return found;
}

// 이미지 노드가 업로드가 끝나지 않은 상태인지(업로드 중, 실패, 복사해 붙여넣은 blob 자리표시)
function isPendingImage(node: PmNode): boolean {
  if (node.type.name !== 'image') return false;
  return Boolean(node.attrs.uploadId) || String(node.attrs.src ?? '').startsWith('blob:');
}

// 업로드가 끝나지 않은 이미지 노드 수 (자동저장 차단 요인)
export function countUploadingNodes(doc: PmNode): number {
  let count = 0;
  doc.descendants((node) => {
    if (isPendingImage(node)) count += 1;
    return true;
  });
  return count;
}

// 노드 속성을 바꾼다(비동기 갱신). 노드가 사라졌으면 아무것도 하지 않는다
// - 화면을 떠나 에디터가 없어졌으면 조용히 끝낸다(isDestroyed는 DOM 없는 에디터에서도 참이라 쓰지 않는다)
function updateUploadNode(editor: Editor, uploadId: string, attrs: Record<string, unknown>) {
  try {
    const target = findUploadNode(editor.state.doc, uploadId);
    if (!target) return;
    const tr = editor.state.tr.setNodeMarkup(target.pos, undefined, {
      ...target.node.attrs,
      ...attrs,
    });
    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
  } catch (error) {
    console.warn('[editor] 업로드 노드 갱신을 건너뜀', error);
  }
}

// 파일 이름에서 확장자를 뗀 대체 텍스트
function altFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

// 업로드를 시작한다. 결과를 기억하고 노드 속성에 적는다
function startUpload(editor: Editor, uploadId: string, options: ImageUploadOptions) {
  const pending = pendingFiles.get(uploadId);
  if (!pending || !options.transport) return;
  inFlight.add(uploadId);
  results.delete(uploadId);
  uploadAsset(pending.file, options.transport, (ratio) => {
    updateUploadNode(editor, uploadId, { uploadProgress: Math.round(ratio * 100) });
  })
    .then(({ asset }) => {
      results.set(uploadId, { src: asset.url });
      inFlight.delete(uploadId);
      pendingFiles.delete(uploadId);
      URL.revokeObjectURL(pending.blobUrl);
      updateUploadNode(editor, uploadId, {
        src: asset.url,
        uploadId: null,
        uploadProgress: null,
        uploadError: null,
      });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : '업로드에 실패했습니다.';
      results.set(uploadId, { error: message });
      inFlight.delete(uploadId);
      updateUploadNode(editor, uploadId, { uploadError: message, uploadProgress: null });
    });
}

// 받는 파일만 골라 자리표시 노드를 tr에 넣는다. 넣은 uploadId 목록을 돌려준다(없으면 빈 배열)
function insertPlaceholders(
  tr: Transaction,
  schema: Schema,
  files: File[],
  pos: number | undefined,
  options: ImageUploadOptions,
): string[] {
  const accepted = files.filter((file) => {
    const check = checkUploadFile(file);
    if (!check.ok) options.onReject(`${file.name}: ${check.message}`);
    return check.ok;
  });
  if (accepted.length === 0) return [];

  const uploadIds: string[] = [];
  const nodes = accepted.map((file) => {
    const uploadId = crypto.randomUUID();
    const blobUrl = URL.createObjectURL(file);
    pendingFiles.set(uploadId, { file, blobUrl });
    uploadIds.push(uploadId);
    return schema.nodes.image.create({
      src: blobUrl,
      alt: altFromFileName(file.name),
      uploadId,
      uploadProgress: 0,
    });
  });

  // 이미지는 인라인 노드다. 블록 사이에 떨어뜨리면 단락으로 감싼다
  const insertAt = Math.min(pos ?? tr.selection.from, tr.doc.content.size);
  const $pos = tr.doc.resolve(insertAt);
  if ($pos.parent.inlineContent) tr.insert(insertAt, nodes);
  else tr.insert(insertAt, schema.nodes.paragraph.create(null, nodes));
  return uploadIds;
}

// 문서에 다시 나타난 업로드 노드에 기억한 결과를 적용한다(되돌리기·다시 실행, 지적 3)
function reconcileUploads(tr: Transaction, doc: PmNode): boolean {
  let changed = false;
  doc.descendants((node, pos) => {
    if (node.type.name !== 'image' || !node.attrs.uploadId) return true;
    const uploadId = String(node.attrs.uploadId);
    const result = results.get(uploadId);
    if (result && 'src' in result) {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        src: result.src,
        uploadId: null,
        uploadProgress: null,
        uploadError: null,
      });
      changed = true;
    } else if (result && 'error' in result) {
      if (node.attrs.uploadError !== result.error) {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          uploadError: result.error,
          uploadProgress: null,
        });
        changed = true;
      }
    } else if (!inFlight.has(uploadId) && !pendingFiles.has(uploadId) && !node.attrs.uploadError) {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        uploadError: LOST_UPLOAD_MESSAGE,
        uploadProgress: null,
      });
      changed = true;
    }
    return true;
  });
  return changed;
}

// 전송 데이터에서 이미지·영상 파일만 꺼낸다
function filesOf(data: DataTransfer | null): File[] {
  if (!data) return [];
  return Array.from(data.files ?? []).filter(
    (file) => file.type.startsWith('image/') || file.type.startsWith('video/'),
  );
}

export const ImageUpload = Extension.create<ImageUploadOptions>({
  name: 'imageUpload',

  addOptions() {
    return { transport: null, onReject: () => {} };
  },

  addCommands() {
    return {
      insertImageFiles:
        (files, pos) =>
        ({ tr, dispatch, editor }) => {
          if (!dispatch) return files.some((file) => checkUploadFile(file).ok);
          const uploadIds = insertPlaceholders(tr, editor.schema, files, pos, this.options);
          // 업로드의 첫 갱신은 비동기다. 그때는 이 tr이 이미 적용되어 있다
          for (const uploadId of uploadIds) startUpload(editor, uploadId, this.options);
          return uploadIds.length > 0;
        },
      retryImageUpload:
        (uploadId) =>
        ({ tr, dispatch, editor }) => {
          if (!canRetryUpload(uploadId)) return false;
          const target = findUploadNode(tr.doc, uploadId);
          if (!target) return false;
          if (dispatch) {
            tr.setNodeMarkup(target.pos, undefined, {
              ...target.node.attrs,
              uploadError: null,
              uploadProgress: 0,
            });
            tr.setMeta('addToHistory', false);
            startUpload(editor, uploadId, this.options);
          }
          return true;
        },
      cancelImageUpload:
        (uploadId) =>
        ({ tr, dispatch }) => {
          const target = findUploadNode(tr.doc, uploadId);
          if (dispatch) {
            const pending = pendingFiles.get(uploadId);
            if (pending) {
              URL.revokeObjectURL(pending.blobUrl);
              pendingFiles.delete(uploadId);
            }
            if (target) tr.delete(target.pos, target.pos + target.node.nodeSize);
          }
          return target !== null;
        },
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const editor = this.editor;
    // 파일을 tr에 넣고 보낸 뒤 업로드를 시작한다(플러그인 처리기용)
    const insertAndUpload = (files: File[], pos: number | undefined): boolean => {
      const tr = editor.state.tr;
      const uploadIds = insertPlaceholders(tr, editor.schema, files, pos, options);
      if (uploadIds.length === 0) return false;
      editor.view.dispatch(tr);
      for (const uploadId of uploadIds) startUpload(editor, uploadId, options);
      return true;
    };
    return [
      new Plugin({
        key: new PluginKey('imageUploadFiles'),
        // 다시 나타난 업로드 노드에 결과를 적용한다
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const tr = newState.tr;
          if (!reconcileUploads(tr, newState.doc)) return null;
          tr.setMeta('addToHistory', false);
          return tr;
        },
        props: {
          // 파일을 떨어뜨리면 그 자리에 넣는다
          handleDrop(view, event) {
            const files = filesOf(event.dataTransfer);
            if (files.length === 0) return false;
            event.preventDefault();
            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
            return insertAndUpload(files, coordinates?.pos);
          },
          // 클립보드의 파일(스크린샷 등)을 커서 자리에 넣는다
          handlePaste(_view, event) {
            const files = filesOf(event.clipboardData);
            if (files.length === 0) return false;
            event.preventDefault();
            return insertAndUpload(files, undefined);
          },
        },
      }),
    ];
  },
});
