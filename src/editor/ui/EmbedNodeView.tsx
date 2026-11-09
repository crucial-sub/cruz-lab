// 임베드 노드 뷰 (재건 3단계 D3·D10: "노드 뷰는 iframe을 그린다. 지우면 노드만 사라진다")
// - 위에 제공자·주소·삭제 줄, 아래에 16:9 iframe. iframe 주소는 detectEmbed가 만든 허용 호스트 주소뿐이다.
// - 선택하지 않은 동안에는 iframe 위에 투명한 막을 둔다. 누르면 노드가 선택된다(재생하려면 한 번 더 누른다).

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import {
  detectEmbed,
  EMBED_IFRAME_REFERRER_POLICY,
  EMBED_IFRAME_SANDBOX,
} from '@/lib/content/embed-url';
import { classNames } from './class-names';

const PROVIDER_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  codesandbox: 'CodeSandbox',
};

export function EmbedNodeView({ node, selected, deleteNode, editor }: NodeViewProps) {
  const url = String(node.attrs.url ?? '');
  const info = detectEmbed(url);
  return (
    <NodeViewWrapper
      className={classNames('editor-embed', selected && 'is-selected')}
      data-embed-url={url}
    >
      <div className="editor-embed-bar" contentEditable={false}>
        <span className="font-semibold">{PROVIDER_LABELS[info?.provider ?? ''] ?? '임베드'}</span>
        <span className="min-w-0 flex-1 truncate">{url}</span>
        {editor.isEditable && (
          <button type="button" className="editor-chip editor-chip-danger" onClick={deleteNode}>
            삭제
          </button>
        )}
      </div>
      {info ? (
        <div className="embed" contentEditable={false}>
          <iframe
            src={info.embedUrl}
            title={`${PROVIDER_LABELS[info.provider]} 임베드`}
            loading="lazy"
            sandbox={EMBED_IFRAME_SANDBOX}
            referrerPolicy={EMBED_IFRAME_REFERRER_POLICY}
            allowFullScreen
          />
          {!selected && <div className="editor-embed-shield" aria-hidden="true" />}
        </div>
      ) : (
        <p className="editor-embed-invalid" contentEditable={false}>
          지원하지 않는 주소입니다. 지우고 다시 넣으세요.
        </p>
      )}
    </NodeViewWrapper>
  );
}
