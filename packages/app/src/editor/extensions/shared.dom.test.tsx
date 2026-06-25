import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { sharedExtensions } from './shared';

describe('sharedExtensions module graph', () => {
  afterEach(() => {
    cleanup();
  });

  test('loads under the DOM test substrate without initialization cycles', async () => {
    expect(sharedExtensions.length).toBeGreaterThan(0);
  });

  const flushRaf = () =>
    new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

  const dispatchEscape = (editor: Editor) =>
    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );

  test('Escape on a top-level NodeSelection blurs the editor (WCAG 2.1.2 keyboard exit, paired with TabFocusTrap)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const editor = new Editor({
      element: container,
      content: '<p>alpha</p>',
      extensions: sharedExtensions,
      editable: true,
    });

    try {
      editor.view.dom.focus();
      expect(document.activeElement).toBe(editor.view.dom);

      editor.commands.setNodeSelection(0);
      expect(editor.state.selection.$from.depth).toBe(0);

      dispatchEscape(editor);
      await flushRaf();

      expect(document.activeElement).not.toBe(editor.view.dom);
    } finally {
      editor.destroy();
      container.remove();
    }
  });

  test('Escape on a TextSelection inside a paragraph escalates to NodeSelection (does NOT blur on first press)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const editor = new Editor({
      element: container,
      content: '<p>alpha</p>',
      extensions: sharedExtensions,
      editable: true,
    });

    try {
      editor.view.dom.focus();
      editor.commands.setTextSelection({ from: 1, to: 6 });
      expect(document.activeElement).toBe(editor.view.dom);

      dispatchEscape(editor);
      await flushRaf();

      expect(document.activeElement).toBe(editor.view.dom);
      expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    } finally {
      editor.destroy();
      container.remove();
    }
  });

  test('advertised strikethrough shortcut toggles strike formatting', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const editor = new Editor({
      element: container,
      content: '<p>alpha</p>',
      extensions: sharedExtensions,
      editable: true,
    });

    try {
      editor.commands.setTextSelection({ from: 1, to: 6 });

      expect(editor.isActive('strike')).toBe(false);
      editor.commands.keyboardShortcut('Mod-Shift-x');
      expect(editor.isActive('strike')).toBe(true);
      expect(editor.getHTML()).toContain('<s>alpha</s>');
    } finally {
      editor.destroy();
      container.remove();
    }
  });
});
