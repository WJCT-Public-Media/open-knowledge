import { describe, expect, test } from 'bun:test';
import { dedentBlockJsxClose } from './dedent-block-jsx-close.ts';

describe('dedentBlockJsxClose — happy path (list context)', () => {
  test('2-space-indented closing tag preceded by a bullet list is dedented', () => {
    const input = '<Tab label="A">\n\n- item\n\n  </Tab>\n';
    expect(dedentBlockJsxClose(input)).toBe('<Tab label="A">\n\n- item\n\n</Tab>\n');
  });

  test('3-space-indented closing tag preceded by a bullet list is dedented', () => {
    const input = '<Tab>\n\n- item\n\n   </Tab>\n';
    expect(dedentBlockJsxClose(input)).toBe('<Tab>\n\n- item\n\n</Tab>\n');
  });

  test('1-space-indented closing tag preceded by a list is dedented', () => {
    expect(dedentBlockJsxClose('- one\n\n </Step>\n')).toBe('- one\n\n</Step>\n');
  });

  test('preceded by an ordered list (`1.`) — same trigger', () => {
    expect(dedentBlockJsxClose('1. one\n\n  </Tab>\n')).toBe('1. one\n\n</Tab>\n');
  });

  test('preceded by an asterisk-marker list — same trigger', () => {
    expect(dedentBlockJsxClose('* one\n\n  </Tab>\n')).toBe('* one\n\n</Tab>\n');
  });

  test('preceded by a plus-marker list — same trigger', () => {
    expect(dedentBlockJsxClose('+ one\n\n  </Tab>\n')).toBe('+ one\n\n</Tab>\n');
  });

  test('the full PRD-6759 repro shape: every Tab child closing dedents in one pass', () => {
    const input = [
      '<Tabs>',
      '',
      '<Tab label="X">',
      '',
      '- one',
      '',
      '  </Tab>',
      '',
      '<Tab label="Y">',
      '',
      '- two',
      '',
      '  </Tab>',
      '',
      '</Tabs>',
      '',
    ].join('\n');
    const out = dedentBlockJsxClose(input);
    expect(out.match(/^<\/Tab>$/gm)).toHaveLength(2);
    expect(out).not.toMatch(/^ {1,3}<\/Tab>$/m);
  });

  test('multiple blank lines between the list and the close — still dedents', () => {
    expect(dedentBlockJsxClose('- one\n\n\n\n  </Tab>\n')).toBe('- one\n\n\n\n</Tab>\n');
  });
});

describe('dedentBlockJsxClose — leave-alone (non-list context)', () => {
  test('preceded by a plain paragraph — NOT dedented (preserves serializer round-trip)', () => {
    const input = '<Step>\n\nA\n\n   </Step>\n';
    expect(dedentBlockJsxClose(input)).toBe(input);
  });

  test('preceded by a heading — NOT dedented (no list-continuation hazard)', () => {
    const input = '<Step>\n\n# Title\n\n  </Step>\n';
    expect(dedentBlockJsxClose(input)).toBe(input);
  });

  test('preceded by the opening JSX tag (empty body) — NOT dedented', () => {
    const input = '<Step>\n\n  </Step>\n';
    expect(dedentBlockJsxClose(input)).toBe(input);
  });

  test('top-of-document indented close — NOT dedented (no preceding context)', () => {
    expect(dedentBlockJsxClose('  </Tab>\n')).toBe('  </Tab>\n');
  });

  test('flush-left closing tag is NOT touched (the regex anchor needs at least one space)', () => {
    const input = '- one\n\n</Tab>\n';
    expect(dedentBlockJsxClose(input)).toBe(input);
  });

  test('4-space indent is NOT dedented (CommonMark indented code block — user-intended code)', () => {
    const input = '- one\n\n    </Tab>\n';
    expect(dedentBlockJsxClose(input)).toBe(input);
  });

  test('lowercase closing tag (HTML element) is NOT touched — `</span>` inside a list item is legitimate inline HTML', () => {
    const input = '- one\n\n  </span>\n';
    expect(dedentBlockJsxClose(input)).toBe(input);
  });

  test('closing tag NOT on its own line (surrounded by prose) is NOT touched', () => {
    const input = '- one\n\n  done. </Tab>\n';
    expect(dedentBlockJsxClose(input)).toBe(input);
  });

  test('inside a fenced code block, an indented `  </Tab>` after a bullet is preserved verbatim (documentation example)', () => {
    const input = '```mdx\n- one\n\n  </Tab>\n```\n';
    expect(dedentBlockJsxClose(input)).toBe(input);
  });

  test('inside a tilde-fenced code block, same preservation', () => {
    const input = '~~~mdx\n- one\n\n  </Tab>\n~~~\n';
    expect(dedentBlockJsxClose(input)).toBe(input);
  });

  test('no `</` anywhere → fast-reject without scanning fences', () => {
    const input = '# heading\n\n- one\n- two\n\nparagraph.\n';
    expect(dedentBlockJsxClose(input)).toBe(input);
  });

  test('idempotent — running twice on already-dedented output is a no-op', () => {
    const once = dedentBlockJsxClose('- one\n\n  </Tab>\n');
    expect(dedentBlockJsxClose(once)).toBe(once);
  });
});

describe('dedentBlockJsxClose — fence boundaries', () => {
  test('an indented closing tag OUTSIDE the fence (after a list) dedents; one INSIDE stays put', () => {
    const input = [
      '```mdx',
      '- one',
      '  </InsideFence>',
      '```',
      '',
      '- two',
      '',
      '  </OutsideFence>',
      '',
    ].join('\n');
    const out = dedentBlockJsxClose(input);
    expect(out).toContain('  </InsideFence>');
    expect(out).toMatch(/^<\/OutsideFence>$/m);
  });

  test('an unclosed fence (extends to EOF) protects everything after it', () => {
    const input = '```mdx\n- one\n\n  </Tab>\n  </Accordion>\n';
    expect(dedentBlockJsxClose(input)).toBe(input);
  });
});

describe('dedentBlockJsxClose — tag-name variants', () => {
  test('tag name with digits and underscores still matches after a list', () => {
    expect(dedentBlockJsxClose('- one\n\n  </Step2_Inner>\n')).toBe('- one\n\n</Step2_Inner>\n');
  });

  test('whitespace before `>` is preserved through the dedent (`</Tab  >`)', () => {
    expect(dedentBlockJsxClose('- one\n\n  </Tab  >\n')).toBe('- one\n\n</Tab  >\n');
  });

  test('trailing whitespace on the line is preserved after the dedent', () => {
    expect(dedentBlockJsxClose('- one\n\n  </Tab>   \n')).toBe('- one\n\n</Tab>   \n');
  });
});
