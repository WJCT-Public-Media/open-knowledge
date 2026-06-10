import { describe, expect, test } from 'bun:test';
import { stripFrontmatter } from '../extensions/frontmatter.ts';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function rt(source: string): string {
  return mdManager.serialize(mdManager.parse(source));
}

function topLevelMdastTypes(source: string): string[] {
  return mdManager.parseToMdast(source).children.map((child) => child.type);
}

describe('content after a doc-start thematic break parses per CommonMark', () => {
  test('a list after a doc-start --- stays a list (no escaped-paragraph collapse)', () => {
    expect(topLevelMdastTypes('---\n\n- a\n- b')).toEqual(['thematicBreak', 'list']);
    expect(rt('---\n\n- a\n- b')).toBe('---\n\n- a\n- b\n');
  });

  test('the recovered-list output is byte-stable across a second round-trip', () => {
    const r1 = rt('---\n\n- a\n- b');
    expect(rt(r1)).toBe(r1);
  });
});

describe('frontmatter-shaped paste is visible content, never silently dropped', () => {
  const fmPaste = '---\nkey: val\n---\n\nbody';

  test('every content byte of a pasted frontmatter block stays visible', () => {
    const out = rt(fmPaste);
    expect(out).toContain('key: val');
    expect(out).toContain('body');
    expect(out).toBe('---\n\nkey: val\n---\n\nbody\n');
  });

  test('the pasted block parses as thematic break + setext heading + paragraph', () => {
    expect(topLevelMdastTypes(fmPaste)).toEqual(['thematicBreak', 'heading', 'paragraph']);
    const heading = mdManager.parseToMdast(fmPaste).children[1];
    expect(heading.type === 'heading' && heading.depth).toBe(2);
  });

  test('the visible-content output is byte-stable across a second round-trip', () => {
    const r1 = rt(fmPaste);
    expect(rt(r1)).toBe(r1);
  });

  test('a yaml node never enters the parse tree', () => {
    for (const input of [fmPaste, '---\ntitle: x\n---\n', '---\n---', '---\n\n---']) {
      expect(topLevelMdastTypes(input)).not.toContain('yaml');
    }
  });
});

describe('doc-start --- is preserved verbatim (the *** override is retired)', () => {
  test('a doc-start --- round-trips as ---', () => {
    expect(rt('---\n\nfoo')).toBe('---\n\nfoo\n');
    expect(rt('---\n')).toBe('---\n');
  });

  test('empty-fence shapes keep both --- lines', () => {
    expect(rt('---\n---')).toBe('---\n\n---\n');
    expect(rt('---\n\n---')).toBe('---\n\n---\n');
  });

  test('*** authored as *** still round-trips as ***', () => {
    expect(rt('***\n\nfoo')).toBe('***\n\nfoo\n');
  });

  test('mid-doc frontmatter-shaped content is untouched (change is doc-start-scoped)', () => {
    expect(rt('x\n\n---\nkey: val\n---')).toBe('x\n\n---\n\nkey: val\n---\n');
  });
});

describe('the pre-existing intake-strip edge (documented, not changed)', () => {
  test('a doc-start --- HR paired with a later --- line is claimed as frontmatter', () => {
    const doc = '---\n\nintro prose\n\n---\n\nbody';
    expect(stripFrontmatter(doc)).toEqual({
      frontmatter: '---\n\nintro prose\n\n---\n',
      body: '\nbody',
    });
  });

  test('a doc-start --- with no later --- line passes through to the parser intact', () => {
    expect(stripFrontmatter('---\n\nbody with no later dashes')).toEqual({
      frontmatter: '',
      body: '---\n\nbody with no later dashes',
    });
    expect(stripFrontmatter('---\n')).toEqual({ frontmatter: '', body: '---\n' });
  });
});
