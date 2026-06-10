import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const md = new MarkdownManager({ extensions: sharedExtensions });

function rt(source: string): string {
  return md.serialize(md.parse(source));
}

function expectByteStable(out: string): void {
  expect(rt(out)).toBe(out);
}

describe('indented-code leading-indent capture (tab-expansion)', () => {
  test('a tab-indented code line round-trips byte-exact', () => {
    expect(rt('\tfoo\tbar')).toBe('\tfoo\tbar\n');
    expectByteStable('\tfoo\tbar\n');
  });

  test('multi-line tab indents round-trip per line', () => {
    expect(rt('\tfoo\n\tbar')).toBe('\tfoo\n\tbar\n');
  });

  test('mixed tab/space indents round-trip per line', () => {
    expect(rt('\tfoo\n    bar')).toBe('\tfoo\n    bar\n');
  });

  test('an interior blank line keeps its own (possibly partial) indent bytes', () => {
    expect(rt('\tfoo\n\n\tbar')).toBe('\tfoo\n\n\tbar\n');
  });

  test('canonical 4-space indents are unchanged (no capture noise)', () => {
    expect(rt('    foo')).toBe('    foo\n');
    expect(rt('     foo')).toBe('     foo\n');
  });

  test('a WYSIWYG-shaped edit that changes the line count falls back to the canonical indent', () => {
    const json = md.parse('\tfoo\n\tbar') as JSONContent;
    const code = json.content?.[0];
    expect(code?.type).toBe('codeBlock');
    if (code) code.content = [{ type: 'text', text: 'foo\nbar\nbaz' }];
    const out = md.serialize(json);
    expect(out).toBe('    foo\n    bar\n    baz\n');
    expectByteStable(out);
  });
});

describe('document-head BOM capture', () => {
  test('a BOM-led document round-trips the BOM', () => {
    expect(rt('\uFEFFhello')).toBe('\uFEFFhello\n');
    expectByteStable('\uFEFFhello\n');
  });

  test('the BOM composes with other captured boundary state', () => {
    expect(rt('\uFEFF\n\nhello')).toBe('\uFEFF\n\nhello\n');
  });
});

describe('BOM offset-rebase latent bug (first-node source-form mis-slice)', () => {
  test('a BOM-led spaced thematic break keeps its exact glyphs (non-doc-start)', () => {
    const out = rt('\uFEFFx\n\n- - -');
    expect(out).toBe('\uFEFFx\n\n- - -\n');
    expectByteStable(out);
  });

  test('a BOM-led ATX heading keeps its interior spacing capture', () => {
    expect(rt('\uFEFF##  x')).toBe('\uFEFF##  x\n');
  });

  test('a BOM-led doc-start dash break behaves like its non-BOM twin (glyphs preserved)', () => {
    expect(rt('\uFEFF- - -')).toBe('\uFEFF- - -\n');
    expect(rt('- - -')).toBe('- - -\n');
    expect(md.parseToMdast(rt('- - -')).children[0]?.type).toBe('thematicBreak');
  });

  test('non-BOM controls are byte-identical to their pre-capture behavior', () => {
    expect(rt('x\n\n- - -')).toBe('x\n\n- - -\n');
    expect(rt('##  x')).toBe('##  x\n');
  });
});

describe('doc-leading blank-line capture', () => {
  test('leading blank lines round-trip', () => {
    expect(rt('\n\nhello')).toBe('\n\nhello\n');
    expect(rt('\nhello')).toBe('\nhello\n');
    expectByteStable('\n\nhello\n');
  });
});

describe('doc-trailing blank-line capture', () => {
  test('trailing blank lines round-trip byte-exact', () => {
    expect(rt('hello\n\n')).toBe('hello\n\n');
    expect(rt('hello\n\n\n')).toBe('hello\n\n\n');
  });

  test('the canonical single final newline is unchanged', () => {
    expect(rt('hello')).toBe('hello\n');
    expect(rt('hello\n')).toBe('hello\n');
  });
});

describe('inter-block blank-line-count capture', () => {
  test('extra blank lines between blocks round-trip', () => {
    expect(rt('a\n\n\n\nb')).toBe('a\n\n\n\nb\n');
    expect(rt('a\n\n\nb')).toBe('a\n\n\nb\n');
    expectByteStable('a\n\n\n\nb\n');
  });

  test('per-boundary counts are independent across three blocks', () => {
    expect(rt('a\n\n\n\nb\n\n\nc')).toBe('a\n\n\n\nb\n\n\nc\n');
  });

  test('the canonical single blank line is unchanged', () => {
    expect(rt('a\n\nb')).toBe('a\n\nb\n');
  });

  test('a 0-blank adjacency still normalizes to the canonical blank line', () => {
    expect(rt('# H\nP')).toBe('# H\n\nP\n');
  });

  test('a WYSIWYG-shaped block deletion drops the stale gap capture', () => {
    const json = md.parse('a\n\n\n\nb\n\n\n\nc') as JSONContent;
    expect(json.content?.length).toBe(3);
    json.content = json.content?.slice(0, 2) ?? [];
    const out = md.serialize(json);
    expect(out).toBe('a\n\nb\n');
    expectByteStable(out);
  });
});

describe('composed doc-boundary state', () => {
  test('BOM + leading + gaps + trailing all round-trip together', () => {
    const doc = '\uFEFF\n\na\n\n\n\nb\n\n';
    expect(rt(doc)).toBe(doc);
    expectByteStable(doc);
  });
});
