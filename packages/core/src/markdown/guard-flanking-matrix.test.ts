import { describe, expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sharedExtensions } from '../extensions/shared.ts';
import {
  ATTENTION_DELIMITERS,
  buildGuardFlankingMatrix,
  computeGuardFlankingCells,
  computeGuardSubstitutionRows,
  diffGuardFlankingMatrix,
  type FlankClass,
  type GuardFlankingMatrix,
} from './guard-flanking-matrix.ts';
import { MarkdownManager } from './index.ts';

const md = new MarkdownManager({ extensions: sharedExtensions });
const roundTrip = (source: string) => md.serialize(md.parse(source));

function textContent(source: string): string {
  let out = '';
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    const rec = node as { value?: unknown; children?: unknown[] };
    if (typeof rec.value === 'string') out += rec.value;
    if (Array.isArray(rec.children)) rec.children.forEach(walk);
  };
  walk(md.parseToMdast(source));
  return out;
}

const MATRIX_PATH = path.join(import.meta.dir, 'guard-flanking-matrix.json');

function readCommitted(): GuardFlankingMatrix {
  return JSON.parse(readFileSync(MATRIX_PATH, 'utf8')) as GuardFlankingMatrix;
}

if (process.env.OK_UPDATE_GUARD_FLANKING_MATRIX === '1') {
  writeFileSync(MATRIX_PATH, `${JSON.stringify(buildGuardFlankingMatrix(roundTrip), null, 2)}\n`);
}

describe('guard-flanking matrix - computation', () => {
  test('every guard substitution is classified; the punctuation->PUA rows are class-changing', () => {
    const rows = computeGuardSubstitutionRows();
    const changed = rows.filter((r) => r.classChanged);
    const preserved = rows.filter((r) => !r.classChanged);
    expect(changed.map((r) => `${r.alphabet}:${r.from}`).sort()).toEqual([
      'backslash-escape:\\',
      'entity-ref:&',
      'entity-ref:;',
      'r23::',
      'r23:<',
      'r23:>',
      'r23:@',
      'r23:{',
    ]);
    const expectedDelta: { from: FlankClass; to: FlankClass } = {
      from: 'punctuation',
      to: 'other',
    };
    for (const row of changed) {
      expect(row.fromClass).toBe(expectedDelta.from);
      expect(row.toClass).toBe(expectedDelta.to);
    }
    for (const row of preserved) {
      expect(row.alphabet).toBe('r23-sentinel-escape');
      expect(row.fromClass).toBe('other');
      expect(row.toClass).toBe('other');
    }
  });

  test('every class-changing substitution x delimiter carries a cell with protect-layer-verified adjacency', () => {
    const cells = computeGuardFlankingCells();
    expect(cells.length).toBe(8 * ATTENTION_DELIMITERS.length);
    const keys = new Set(cells.map((c) => `${c.alphabet}:${c.from} x ${c.delimiter}`));
    for (const row of computeGuardSubstitutionRows().filter((r) => r.classChanged)) {
      for (const delimiter of ATTENTION_DELIMITERS) {
        expect(keys.has(`${row.alphabet}:${row.from} x ${delimiter}`)).toBe(true);
      }
    }
  });
});

describe('guard-flanking matrix - freshness gate', () => {
  test('committed snapshot matches a live recompute (regen: bun run gen:guard-flanking-matrix)', () => {
    const live = buildGuardFlankingMatrix(roundTrip);
    const mismatches = diffGuardFlankingMatrix(live, readCommitted());
    expect(mismatches).toEqual([]);
    for (const [index, cell] of live.cells.entries()) {
      expect(cell.roundTrip).toBe(readCommitted().cells[index]?.roundTrip ?? '');
    }
  });

  test('every committed cell is lossless, idempotent, and preserves the guarded bytes verbatim', () => {
    for (const cell of readCommitted().cells) {
      const rt1 = roundTrip(cell.witness);
      expect(rt1).toBe(cell.roundTrip);
      expect(roundTrip(rt1)).toBe(rt1);
      expect(textContent(rt1)).toBe(textContent(cell.witness));
      if (cell.alphabet === 'entity-ref') {
        expect(rt1).toContain('&#x41;');
      }
    }
  });
});

describe('guard-flanking matrix - non-vacuity (tamper)', () => {
  test('a dropped committed cell fails the freshness diff', () => {
    const live = buildGuardFlankingMatrix(roundTrip);
    const tampered: GuardFlankingMatrix = { ...live, cells: live.cells.slice(1) };
    const mismatches = diffGuardFlankingMatrix(live, tampered);
    expect(mismatches.some((m) => m.includes('not committed'))).toBe(true);
  });

  test('a drifted round-trip pin fails the per-cell byte compare', () => {
    const committed = readCommitted();
    const first = committed.cells[0];
    if (!first) throw new Error('empty committed matrix');
    expect(roundTrip(first.witness)).not.toBe(`${first.roundTrip}tampered`);
  });

  test('a substitution removed from a guard alphabet fails the freshness diff', () => {
    const live = buildGuardFlankingMatrix(roundTrip);
    const tampered: GuardFlankingMatrix = {
      ...live,
      substitutions: live.substitutions.filter((r) => r.from !== '&'),
      cells: live.cells.filter((c) => c.from !== '&'),
    };
    const mismatches = diffGuardFlankingMatrix(live, tampered);
    expect(mismatches.some((m) => m.includes('entity-ref:&'))).toBe(true);
  });
});
