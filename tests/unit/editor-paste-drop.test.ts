// 이미지 업로드 확장 테스트 (재건 3단계 D11, 리뷰 6.2 지적 2b·3·4)
// - DOM 없는 Tiptap Editor(element: null)에 상태 플러그인(history, appendTransaction)을 붙여 돌린다.
import { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { describe, expect, it } from 'vitest';
import { createEditorExtensions } from '@/editor/extensions';
import type { UploadedAsset } from '@/editor/upload/image-size';
import { canRetryUpload, countUploadingNodes, ImageUpload } from '@/editor/upload/paste-drop';
import type { UploadTransport } from '@/editor/upload/upload-client';

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

const ASSET: UploadedAsset = {
  id: 'a1',
  url: 'https://cdn.example/assets/a1/w1600.webp',
  contentType: 'image/webp',
  variants: null,
};

// upload-url 응답을 테스트가 정하는 전송
function controllableTransport() {
  const calls: string[] = [];
  let respond: (value: { existing: UploadedAsset } | Error) => void = () => {};
  const transport: UploadTransport = {
    requestUploadUrl: () =>
      new Promise((resolve, reject) => {
        calls.push('upload-url');
        respond = (value) => (value instanceof Error ? reject(value) : resolve(value));
      }),
    put: async () => {},
    finalize: async () => ({ asset: ASSET }),
  };
  return {
    transport,
    calls,
    succeed: () => respond({ existing: ASSET }),
    fail: () => respond(new Error('CORS')),
  };
}

function makeEditor(transport: UploadTransport) {
  const editor = new Editor({
    element: null,
    extensions: [
      ...createEditorExtensions(),
      ImageUpload.configure({ transport, onReject: () => {} }),
    ],
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '본문' }] }],
    },
  });
  // DOM이 없으면 플러그인이 붙지 않는다. history·appendTransaction 같은 상태 플러그인만 붙인다
  (editor as unknown as { editorState: unknown }).editorState = editor.state.reconfigure({
    plugins: editor.extensionManager.plugins,
  });
  return editor;
}

function imageAttrs(editor: Editor): Record<string, unknown> | null {
  let attrs: Record<string, unknown> | null = null;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'image') attrs = node.attrs;
  });
  return attrs;
}

const file = () => new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });

describe('ImageUpload 명령', () => {
  it('insertImageFiles는 예외 없이 blob 자리표시를 넣고, 업로드가 끝나면 자산 주소로 바꾼다', async () => {
    const env = controllableTransport();
    const editor = makeEditor(env.transport);
    expect(() => editor.commands.insertImageFiles([file()])).not.toThrow();
    const placeholder = imageAttrs(editor);
    expect(String(placeholder?.src)).toMatch(/^blob:/);
    expect(placeholder?.uploadId).toBeTruthy();
    expect(countUploadingNodes(editor.state.doc)).toBe(1);

    await tick();
    env.succeed();
    await tick();
    expect(imageAttrs(editor)).toMatchObject({ src: ASSET.url, uploadId: null });
    expect(countUploadingNodes(editor.state.doc)).toBe(0);
  });

  it('실패하면 uploadError를 적고, retryImageUpload는 예외 없이 같은 파일로 다시 올린다', async () => {
    const env = controllableTransport();
    const editor = makeEditor(env.transport);
    editor.commands.insertImageFiles([file()]);
    await tick();
    env.fail();
    await tick();
    const failed = imageAttrs(editor);
    expect(failed?.uploadError).toBe('CORS');
    const uploadId = String(failed?.uploadId);
    expect(canRetryUpload(uploadId)).toBe(true);

    expect(() => editor.commands.retryImageUpload(uploadId)).not.toThrow();
    expect(imageAttrs(editor)?.uploadError).toBeNull();
    await tick();
    env.succeed();
    await tick();
    expect(imageAttrs(editor)).toMatchObject({ src: ASSET.url, uploadId: null });
  });

  it('cancelImageUpload는 노드를 지운다', async () => {
    const env = controllableTransport();
    const editor = makeEditor(env.transport);
    editor.commands.insertImageFiles([file()]);
    const uploadId = String(imageAttrs(editor)?.uploadId);
    editor.commands.cancelImageUpload(uploadId);
    expect(imageAttrs(editor)).toBeNull();
    expect(canRetryUpload(uploadId)).toBe(false);
  });
});

describe('ImageUpload 되돌리기 (지적 3)', () => {
  it('되돌린 동안 업로드가 끝나도, 다시 실행하면 노드가 자산 주소를 받는다', async () => {
    const env = controllableTransport();
    const editor = makeEditor(env.transport);
    editor.commands.insertImageFiles([file()]);
    await tick();
    editor.commands.undo();
    expect(imageAttrs(editor)).toBeNull();
    env.succeed();
    await tick();
    editor.commands.redo();
    expect(imageAttrs(editor)).toMatchObject({ src: ASSET.url, uploadId: null });
    expect(countUploadingNodes(editor.state.doc)).toBe(0);
  });

  it('업로드 중에 지우고 끝난 뒤 되돌리면 노드가 자산 주소를 받는다', async () => {
    const env = controllableTransport();
    const editor = makeEditor(env.transport);
    editor.commands.insertImageFiles([file()]);
    await tick();
    // 넣기와 지우기를 다른 되돌리기 단위로 나눈다(500ms 안의 변경은 한 단위로 묶인다)
    editor.view.dispatch(closeHistory(editor.state.tr));
    editor.commands.selectAll();
    editor.commands.deleteSelection();
    env.succeed();
    await tick();
    editor.commands.undo();
    expect(imageAttrs(editor)).toMatchObject({ src: ASSET.url, uploadId: null });
  });

  it('되돌린 동안 실패하면, 다시 실행한 노드에 오류가 보여 다시 시도할 수 있다', async () => {
    const env = controllableTransport();
    const editor = makeEditor(env.transport);
    editor.commands.insertImageFiles([file()]);
    await tick();
    editor.commands.undo();
    env.fail();
    await tick();
    editor.commands.redo();
    const attrs = imageAttrs(editor);
    expect(attrs?.uploadError).toBe('CORS');
    expect(canRetryUpload(String(attrs?.uploadId))).toBe(true);
  });

  it('업로드 정보가 없는 노드(지운 뒤 되돌림 등)는 오류로 표시하고 다시 시도할 수 없다', async () => {
    const env = controllableTransport();
    const editor = makeEditor(env.transport);
    editor.commands.insertContent({
      type: 'image',
      attrs: { src: 'blob:http://localhost/x', uploadId: 'lost-id', uploadProgress: 0 },
    });
    expect(String(imageAttrs(editor)?.uploadError)).toContain('업로드 정보');
    expect(canRetryUpload('lost-id')).toBe(false);
    expect(countUploadingNodes(editor.state.doc)).toBe(1);
  });
});

describe('countUploadingNodes (지적 2b)', () => {
  it('uploadId가 없어도 src가 blob:이면 저장을 막는 이미지로 센다(복사해 붙여넣은 자리표시)', () => {
    const editor = makeEditor(controllableTransport().transport);
    editor.commands.insertContent({
      type: 'image',
      attrs: { src: 'blob:http://localhost/copied' },
    });
    expect(countUploadingNodes(editor.state.doc)).toBe(1);
  });
});
