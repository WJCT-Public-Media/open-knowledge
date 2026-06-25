import { sharedExtensions as coreExtensions } from '@inkeep/open-knowledge-core';
import { Extension } from '@tiptap/core';
import FileHandler from '@tiptap/extension-file-handler';
import { KeyboardNav } from '../block-ux/keyboard-nav';
import { TiptapFindReplace } from '../find-replace/tiptap-find-replace-extension';
import { uploadAndInsert } from '../image-upload/index.ts';
import { getComponentItems, getInlineComponentItems } from '../slash-command/component-items';
import { getEmbedStarterItems } from '../slash-command/embed-starter-items';
import { getSlashCommandItems } from '../slash-command/items';
import { BlockMover } from './block-mover';
import { BridgeIdPlugin } from './bridge-id-plugin';
import { chunkWrapperDecorationPlugin } from './chunk-wrapper-decoration';
import { CodeBlockFidelity } from './code-block';
import { BlockDragHandle } from './drag-handle';
import { FootnoteAnchorScroll } from './footnote-anchor-scroll';
import { FormattingShortcuts } from './formatting-shortcuts';
import { HeadingAnchors } from './heading-anchors';
import { ImageInlineZoom } from './image-inline-zoom';
import { InternalLink } from './internal-link';
import { JsxComponent } from './jsx-component';
import { MathInline } from './math-inline';
import { RawMdxFallback } from './raw-mdx-fallback';
import { SelectionStatePlugin } from './selection-state-plugin';
import { SlashCommand } from './slash-command';
import { SourceDirtyObserver } from './source-dirty-observer';
import { TabFocusTrap } from './tab-focus-trap';
import { TableInsertControls } from './table-insert-controls';
import { TagClickPlugin } from './tag-click-plugin';
import { Tag } from './tag-view';
import { WikiLink } from './wiki-link';
import { WikiLinkEmbed } from './wiki-link-embed';

export const sharedExtensions = [
  ...coreExtensions.map((ext) => {
    if (ext.name === 'jsxComponent') return JsxComponent;
    if (ext.name === 'image') {
      const coreOptions = (ext as unknown as { options?: Record<string, unknown> }).options ?? {};
      return ImageInlineZoom.configure({ ...coreOptions, inline: true });
    }
    if (ext.name === 'rawMdxFallback') return RawMdxFallback;
    if (ext.name === 'wikiLink') return WikiLink;
    if (ext.name === 'wikiLinkEmbed') return WikiLinkEmbed;
    if (ext.name === 'link') return InternalLink;
    if (ext.name === 'mathInline') return MathInline;
    if (ext.name === 'tag') return Tag;
    if (ext.name === 'codeBlock') return CodeBlockFidelity;
    return ext;
  }),
  SlashCommand.configure({
    itemsSources: [
      getSlashCommandItems,
      getComponentItems,
      getEmbedStarterItems,
      getInlineComponentItems,
    ],
    categoryLabels: {
      content: 'Components',
      layout: 'Layout',
      media: 'Media',
      data: 'Data',
      embed: 'Embeds',
    },
  }),
  FormattingShortcuts,
  TabFocusTrap,
  FileHandler.configure({
    onDrop(editor, files, pos) {
      for (const file of files) {
        uploadAndInsert(file, editor, pos);
      }
    },
    onPaste(editor, files, _html) {
      for (const file of files) {
        uploadAndInsert(file, editor, editor.state.selection.from);
      }
    },
  }),
  HeadingAnchors,
  TiptapFindReplace,
  TagClickPlugin,
  FootnoteAnchorScroll,
  BlockDragHandle,
  BlockMover,
  TableInsertControls,
  SourceDirtyObserver,
  KeyboardNav,
  BridgeIdPlugin,
  SelectionStatePlugin,
  Extension.create({
    name: 'chunkWrapperDecoration',
    addProseMirrorPlugins() {
      return [chunkWrapperDecorationPlugin()];
    },
  }),
];
