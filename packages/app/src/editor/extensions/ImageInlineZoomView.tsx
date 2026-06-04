
import { toDesktopAssetHref } from '@inkeep/open-knowledge-core';
import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import Zoom from 'react-medium-image-zoom';

export function ImageInlineZoomView({ node }: NodeViewProps) {
  const rawSrc = node.attrs.src;
  const rawAlt = node.attrs.alt;
  const rawTitle = node.attrs.title;
  const src = typeof rawSrc === 'string' ? toDesktopAssetHref(rawSrc) : undefined;
  const alt = typeof rawAlt === 'string' ? rawAlt : '';
  const title = typeof rawTitle === 'string' ? rawTitle : undefined;
  return (
    <NodeViewWrapper as="span" data-image-inline-zoom data-clipboard-inline-leaf="image">
      <Zoom wrapElement="span" zoomMargin={20} zoomImg={{ sizes: undefined }}>
        <img src={src} alt={alt} title={title} />
      </Zoom>
    </NodeViewWrapper>
  );
}
