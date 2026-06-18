import { describe, expect, test } from 'bun:test';
import { SUPPORTED_DOC_EXTENSIONS } from '../../doc-extensions.ts';
import { DocExtensionArg, FrontmatterArg } from './verb-schemas.ts';

describe('FrontmatterArg — recursive value contract (PRD-6947)', () => {
  test('flat scalar values still parse (regression guard for the pre-PRD-6947 contract)', () => {
    const result = FrontmatterArg.safeParse({
      title: 'Q3 Planning',
      done: true,
      score: 0.95,
      tags: ['planning', 'q3'],
    });
    expect(result.success).toBe(true);
  });

  test('nested-object value at a top-level key parses', () => {
    const result = FrontmatterArg.safeParse({
      metadata: { version: '1.0.0', author: 'Inkeep' },
    });
    expect(result.success).toBe(true);
  });

  test('arbitrarily deep nesting (map in map in map) parses', () => {
    const result = FrontmatterArg.safeParse({
      metadata: { outer: { inner: { leaf: 'deep' } } },
    });
    expect(result.success).toBe(true);
  });

  test('array-of-objects value parses; element objects pass through unchanged (NOT String()-coerced)', () => {
    const input = {
      plugins: [
        { name: 'alpha', version: '1.0' },
        { name: 'beta', version: '2.0' },
      ],
    };
    const result = FrontmatterArg.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  test('top-level null parses (RFC 7396 delete sentinel preserved)', () => {
    const result = FrontmatterArg.safeParse({ metadata: null });
    expect(result.success).toBe(true);
  });

  test('nested null INSIDE a subtree is rejected (D9: wire stays additive, no path syntax)', () => {
    const result = FrontmatterArg.safeParse({ metadata: { version: null } });
    expect(result.success).toBe(false);
  });

  test('mixed flat + nested keys in one patch parse together', () => {
    const result = FrontmatterArg.safeParse({
      title: 'Skill',
      tags: ['demo'],
      metadata: { version: '1.0.0', author: 'Inkeep' },
    });
    expect(result.success).toBe(true);
  });

  test('description text reflects recursive value contract (no stale "flat mapping" claim)', () => {
    const description = FrontmatterArg.description ?? '';
    expect(description).toContain('nested');
    expect(description).not.toContain('flat key→value');
  });
});

describe('DocExtensionArg — explicit on-create file format', () => {
  test('accepts every supported extension', () => {
    for (const ext of SUPPORTED_DOC_EXTENSIONS) {
      expect(DocExtensionArg.safeParse(ext).success).toBe(true);
    }
  });

  test('rejects unsupported extensions', () => {
    for (const bad of ['.markdown', '.txt', 'mdx', '.MDX', '']) {
      expect(DocExtensionArg.safeParse(bad).success).toBe(false);
    }
  });

  test('enum is single-sourced from SUPPORTED_DOC_EXTENSIONS (no drift)', () => {
    expect(DocExtensionArg.options).toEqual([...SUPPORTED_DOC_EXTENSIONS]);
  });

  test('description names .mdx + default and is part of the agent-facing wire contract', () => {
    const description = DocExtensionArg.description ?? '';
    expect(description).toContain('.mdx');
    expect(description).toContain('default');
  });
});
