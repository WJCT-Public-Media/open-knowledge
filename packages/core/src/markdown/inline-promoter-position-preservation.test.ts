import { describe, expect, test } from 'bun:test';
import type { Root as MdastRoot, Nodes } from 'mdast';
import { visit } from 'unist-util-visit';

import { sharedExtensions } from '../extensions/shared.ts';
import { createParseProcessor, parseMdToMdast } from './pipeline.ts';

const proc = createParseProcessor({ extensions: sharedExtensions });

function parse(source: string): MdastRoot {
  return parseMdToMdast(source, proc);
}

function findNodesByType(tree: MdastRoot, type: string): Nodes[] {
  const found: Nodes[] = [];
  visit(tree, type, (node) => {
    found.push(node as Nodes);
  });
  return found;
}

function assertHasPosition(node: Nodes) {
  expect(node.position).toBeDefined();
  expect(typeof node.position?.start.offset).toBe('number');
  expect(typeof node.position?.end?.offset).toBe('number');
}

function getStartOffset(node: Nodes): number {
  return node.position?.start?.offset ?? -1;
}

function getEndOffset(node: Nodes): number {
  return node.position?.end?.offset ?? -1;
}

function slicePosition(source: string, node: Nodes): string {
  const s = getStartOffset(node);
  const e = getEndOffset(node);
  if (s < 0 || e < 0) return '';
  return source.slice(s, e);
}

describe('inline-promoter position preservation', () => {
  describe('single-dollar-math ($x$)', () => {
    test('inlineMath node has position pointing to $', () => {
      const source = 'Hello $x$ world';
      const tree = parse(source);
      const nodes = findNodesByType(tree, 'inlineMath');
      expect(nodes.length).toBe(1);
      assertHasPosition(nodes[0]);
      expect(source[getStartOffset(nodes[0])]).toBe('$');
    });

    test('text fragments around $a$ have position', () => {
      const source = 'Hello $a$ world';
      const tree = parse(source);
      const paragraph = tree.children[0] as Nodes & { children: Nodes[] };
      for (const child of paragraph.children) {
        assertHasPosition(child);
      }
    });

    test('multiple math nodes preserve ordered positions', () => {
      const source = 'See $a$ and $b$ here';
      const tree = parse(source);
      const nodes = findNodesByType(tree, 'inlineMath');
      expect(nodes.length).toBe(2);
      for (const n of nodes) assertHasPosition(n);
      expect(getStartOffset(nodes[0])).toBeLessThan(getStartOffset(nodes[1]));
    });
  });

  describe('highlight (==text==)', () => {
    test('mark node has position starting at ==', () => {
      const source = 'Hello ==word== world';
      const tree = parse(source);
      const nodes = findNodesByType(tree, 'mark');
      expect(nodes.length).toBe(1);
      assertHasPosition(nodes[0]);
      expect(source.slice(getStartOffset(nodes[0]), getStartOffset(nodes[0]) + 2)).toBe('==');
    });

    test('text fragments around ==a== have position', () => {
      const source = 'Hello ==a== world';
      const tree = parse(source);
      const paragraph = tree.children[0] as Nodes & { children: Nodes[] };
      for (const child of paragraph.children) {
        assertHasPosition(child);
      }
    });
  });

  describe('comment (%%text%%)', () => {
    test('%%note%% comment has position starting at %%', () => {
      const source = 'Hello %%note%% world';
      const tree = parse(source);
      const nodes = findNodesByType(tree, 'comment');
      expect(nodes.length).toBe(1);
      assertHasPosition(nodes[0]);
      expect(source.slice(getStartOffset(nodes[0]), getStartOffset(nodes[0]) + 2)).toBe('%%');
    });

    test('<!-- html --> comment has position', () => {
      const source = 'Hello <!-- note --> world';
      const tree = parse(source);
      const nodes = findNodesByType(tree, 'comment');
      expect(nodes.length).toBe(1);
      assertHasPosition(nodes[0]);
    });
  });

  describe('tag (#tagname)', () => {
    test('#hello tag has position pointing to #', () => {
      const source = 'See #hello there';
      const tree = parse(source);
      const nodes = findNodesByType(tree, 'tag');
      expect(nodes.length).toBe(1);
      assertHasPosition(nodes[0]);
      expect(source[getStartOffset(nodes[0])]).toBe('#');
    });

    test('multiple tags preserve position', () => {
      const source = '#a and #b';
      const tree = parse(source);
      const nodes = findNodesByType(tree, 'tag');
      expect(nodes.length).toBe(2);
      for (const n of nodes) assertHasPosition(n);
    });
  });

  describe('autolink (<scheme:uri>)', () => {
    test('autolink link has position', () => {
      const source = 'Visit <https://x.com> now';
      const tree = parse(source);
      const links: Nodes[] = [];
      visit(tree, 'link', (node) => {
        const data = (node as Nodes & { data?: Record<string, unknown> }).data;
        if (data?.sourceStyle === 'autolink') links.push(node as Nodes);
      });
      expect(links.length).toBe(1);
      assertHasPosition(links[0]);
    });
  });

  describe('chain: mixed promoters in one paragraph', () => {
    test('$x$ + ==highlight== both have position', () => {
      const source = 'Math $x$ and ==hi== text';
      const tree = parse(source);
      const math = findNodesByType(tree, 'inlineMath');
      const marks = findNodesByType(tree, 'mark');
      expect(math.length).toBe(1);
      expect(marks.length).toBe(1);
      assertHasPosition(math[0]);
      assertHasPosition(marks[0]);
    });

    test('#tag + %%comment%% both have position', () => {
      const source = 'See #tag %%note%% end';
      const tree = parse(source);
      const tags = findNodesByType(tree, 'tag');
      const comments = findNodesByType(tree, 'comment');
      expect(tags.length).toBe(1);
      expect(comments.length).toBe(1);
      assertHasPosition(tags[0]);
      assertHasPosition(comments[0]);
    });
  });

  describe('escape-aware offset accuracy', () => {
    test('\\* before $x$ — math offset points to $', () => {
      const source = '\\*text\\* and $x$ here';
      const tree = parse(source);
      const nodes = findNodesByType(tree, 'inlineMath');
      expect(nodes.length).toBeGreaterThanOrEqual(1);
      expect(source[getStartOffset(nodes[0])]).toBe('$');
    });

    test('\\# is not promoted to tag', () => {
      const source = 'See \\#notag here';
      const tree = parse(source);
      const tags = findNodesByType(tree, 'tag');
      expect(tags.length).toBe(0);
    });
  });

  describe('position byte accuracy', () => {
    test('mark position spans ==world==', () => {
      const source = 'Hello ==world== there';
      const tree = parse(source);
      const marks = findNodesByType(tree, 'mark');
      expect(marks.length).toBe(1);
      expect(slicePosition(source, marks[0])).toBe('==world==');
    });

    test('inlineMath position spans $abc$', () => {
      const source = 'Hello $abc$ there';
      const tree = parse(source);
      const nodes = findNodesByType(tree, 'inlineMath');
      expect(nodes.length).toBe(1);
      expect(slicePosition(source, nodes[0])).toBe('$abc$');
    });

    test('tag position spans #hello', () => {
      const source = 'See #hello there';
      const tree = parse(source);
      const tags = findNodesByType(tree, 'tag');
      expect(tags.length).toBe(1);
      expect(slicePosition(source, tags[0])).toBe('#hello');
    });

    test('comment position spans %%note%%', () => {
      const source = 'See %%note%% there';
      const tree = parse(source);
      const comments = findNodesByType(tree, 'comment');
      expect(comments.length).toBe(1);
      expect(slicePosition(source, comments[0])).toBe('%%note%%');
    });
  });
});
