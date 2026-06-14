import { describe, expect, test } from 'bun:test';
import {
  projectMergeBoundarySpace,
  reattachLeadingDocBoundary,
  splitLeadingDocBoundary,
} from './doc-boundary-space.ts';

const FM = '---\ntitle: Boundary\n---\n';

describe('splitLeadingDocBoundary', () => {
  test('FM doc with the canonical single blank line', () => {
    const split = splitLeadingDocBoundary(`${FM}\nBody line.\n`);
    expect(split.boundary).toBe('\n');
    expect(split.text).toBe(`${FM}Body line.\n`);
  });

  test('FM doc with no boundary is identity', () => {
    const split = splitLeadingDocBoundary(`${FM}Body line.\n`);
    expect(split.boundary).toBe('');
    expect(split.text).toBe(`${FM}Body line.\n`);
  });

  test('multi-newline run is captured greedily and verbatim', () => {
    const split = splitLeadingDocBoundary(`${FM}\n\n\nBody.\n`);
    expect(split.boundary).toBe('\n\n\n');
    expect(split.text).toBe(`${FM}Body.\n`);
  });

  test('CRLF run', () => {
    const fmCrlf = '---\r\ntitle: x\r\n---\r\n';
    const split = splitLeadingDocBoundary(`${fmCrlf}\r\n\r\nBody.\r\n`);
    expect(split.boundary).toBe('\r\n\r\n');
    expect(split.text).toBe(`${fmCrlf}Body.\r\n`);
  });

  test('no FM region: doc-start run is the boundary', () => {
    const split = splitLeadingDocBoundary('\n\nBody only.\n');
    expect(split.boundary).toBe('\n\n');
    expect(split.text).toBe('Body only.\n');
  });

  test('FM-only doc: boundary is the run after the close fence, body empty', () => {
    const split = splitLeadingDocBoundary(`${FM}\n`);
    expect(split.boundary).toBe('\n');
    expect(split.text).toBe(FM);
  });

  test('empty string is identity', () => {
    expect(splitLeadingDocBoundary('')).toEqual({ boundary: '', text: '' });
  });

  test('no-split guard: doc-start run shadowing an FM-shaped block is refused', () => {
    const shadowed = `\n${FM}Body.\n`;
    expect(splitLeadingDocBoundary(shadowed)).toEqual({ boundary: '', text: shadowed });
  });
});

describe('reattachLeadingDocBoundary', () => {
  test('empty boundary is identity', () => {
    expect(reattachLeadingDocBoundary(`${FM}Body.\n`, '')).toBe(`${FM}Body.\n`);
  });

  test('re-inserts between FM region and body', () => {
    expect(reattachLeadingDocBoundary(`${FM}Body.\n`, '\n')).toBe(`${FM}\nBody.\n`);
  });

  test('no FM region: attaches at doc start', () => {
    expect(reattachLeadingDocBoundary('Body.\n', '\n\n')).toBe('\n\nBody.\n');
  });

  test('FM-only doc: boundary becomes the trailing run', () => {
    expect(reattachLeadingDocBoundary(FM, '\n')).toBe(`${FM}\n`);
  });
});

describe('projectMergeBoundarySpace', () => {
  test('FM doc with the canonical blank line is unchanged', () => {
    expect(projectMergeBoundarySpace(`${FM}\nBody.\n`)).toBe(`${FM}\nBody.\n`);
  });

  test('FM doc without a boundary gains the single separator', () => {
    expect(projectMergeBoundarySpace(`${FM}Body.\n`)).toBe(`${FM}\nBody.\n`);
  });

  test('multi-newline boundary normalizes to one separator', () => {
    expect(projectMergeBoundarySpace(`${FM}\n\n\nBody.\n`)).toBe(`${FM}\nBody.\n`);
  });

  test('FM-less doc has its doc-start run stripped', () => {
    expect(projectMergeBoundarySpace('\n\nBody only.\n')).toBe('Body only.\n');
  });

  test('FM-less doc without a run is unchanged', () => {
    expect(projectMergeBoundarySpace('Body only.\n')).toBe('Body only.\n');
  });

  test('empty string is unchanged', () => {
    expect(projectMergeBoundarySpace('')).toBe('');
  });

  test('guard-refused shape passes through unchanged', () => {
    const shadowed = `\n${FM}Body.\n`;
    expect(projectMergeBoundarySpace(shadowed)).toBe(shadowed);
  });

  test('idempotent and content-preserving outside the boundary slot', () => {
    const inputs = [
      `${FM}\nBody.\n`,
      `${FM}Body.\n`,
      `${FM}\n\n\nBody.\n`,
      '\nBody only.\n',
      'Body only.\n',
      `${FM}\n|a|b|\n|-|-|\n`,
    ];
    for (const x of inputs) {
      const once = projectMergeBoundarySpace(x);
      expect(projectMergeBoundarySpace(once)).toBe(once);
      expect(splitLeadingDocBoundary(once).text).toBe(splitLeadingDocBoundary(x).text);
    }
  });
});

describe('round-trip law: reattach(split(x).text, split(x).boundary) === x', () => {
  const fms = [
    '',
    FM,
    '---\n---\n', // empty FM block
    '--- \ntitle: ws fence\n---\t\n', // whitespace-bearing fences (post-#1783 recognition)
    '---\r\ntitle: crlf\r\n---\r\n',
  ];
  const boundaries = ['', '\n', '\n\n', '\n\n\n\n', '\r\n', '\r\n\r\n'];
  const bodies = [
    '',
    'One paragraph.\n',
    'First paragraph body. \n\nSecond paragraph stays.\n',
    '|a|b|\n|-|-|\n|c|d|\n', // un-padded NG-class table — storage never sanitizes
    '---\nlooks like FM\n---\nbut is body\n',
    'no trailing newline',
  ];

  test('holds over composed fm × boundary × body shapes', () => {
    for (const fm of fms) {
      for (const boundary of boundaries) {
        for (const body of bodies) {
          const x = fm + boundary + body;
          const split = splitLeadingDocBoundary(x);
          expect(reattachLeadingDocBoundary(split.text, split.boundary)).toBe(x);
        }
      }
    }
  });

  test('stripped text never begins its body with a newline (no boundary doubling)', () => {
    for (const fm of fms) {
      for (const boundary of boundaries) {
        for (const body of bodies) {
          const split = splitLeadingDocBoundary(fm + boundary + body);
          const resplit = splitLeadingDocBoundary(split.text);
          if (split.boundary !== '') {
            expect(resplit.boundary).toBe('');
          }
        }
      }
    }
  });
});
