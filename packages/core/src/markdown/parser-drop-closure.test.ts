import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { types } from 'micromark-util-symbol';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';
import {
  checkClosure,
  DROPPED_TOKEN_ADJUDICATIONS,
  extractFromMarkdownHandlerKeys,
  extractPreprocessTransforms,
  PINNED_PREPROCESS_SOURCE_SHA256,
  PREPROCESS_TRANSFORM_ADJUDICATIONS,
} from './parser-drop-closure.ts';

const md = new MarkdownManager({ extensions: sharedExtensions });
const roundTrip = (source: string) => md.serialize(md.parse(source));

function libPath(specifier: string, file: string): string {
  const entry = Bun.resolveSync(specifier, import.meta.dir);
  return path.join(path.dirname(entry), file);
}

function computeDroppedTokenTypes(): string[] {
  const handlerKeys = new Set(
    extractFromMarkdownHandlerKeys(
      readFileSync(libPath('mdast-util-from-markdown', 'lib/index.js'), 'utf8'),
    ),
  );
  return Object.values(types)
    .filter((tokenType) => !handlerKeys.has(tokenType))
    .sort();
}

const preprocessSource = readFileSync(libPath('micromark', 'lib/preprocess.js'), 'utf8');

describe('parser-drop closure - dropped token types', () => {
  test('the computed dropped set is fully adjudicated with no stale entries', () => {
    const dropped = computeDroppedTokenTypes();
    expect(dropped.length).toBe(52);
    const result = checkClosure(dropped, DROPPED_TOKEN_ADJUDICATIONS);
    expect(result.unadjudicated).toEqual([]);
    expect(result.stale).toEqual([]);
  });

  test('every format-dof-axis adjudication cites axes that exist in the canonical catalog', () => {
    const catalog = JSON.parse(
      readFileSync(
        path.join(import.meta.dir, '../../../md-conformance/md-audit/format-dof-catalog.json'),
        'utf8',
      ),
    ) as { axes: Array<{ id: string }> };
    const axisIds = new Set(catalog.axes.map((axis) => axis.id));
    for (const [token, adjudication] of Object.entries(DROPPED_TOKEN_ADJUDICATIONS)) {
      if (adjudication.kind !== 'format-dof-axis') continue;
      expect(adjudication.axisIds.length).toBeGreaterThan(0);
      for (const axisId of adjudication.axisIds) {
        expect(axisIds.has(axisId), `${token} cites unknown axis ${axisId}`).toBe(true);
      }
    }
  });

  test('every retained-by-capture witness round-trips byte-exactly through the real engine', () => {
    for (const [token, adjudication] of Object.entries(DROPPED_TOKEN_ADJUDICATIONS)) {
      if (adjudication.kind !== 'retained-by-capture') continue;
      const out = roundTrip(adjudication.witness);
      expect(
        out === adjudication.witness || out === `${adjudication.witness}\n`,
        `${token} witness no longer round-trips: ${JSON.stringify(out)}`,
      ).toBe(true);
    }
  });

  test('every documented-residual witness pins exact current bytes and is idempotent', () => {
    for (const adjudication of Object.values(DROPPED_TOKEN_ADJUDICATIONS)) {
      if (adjudication.kind !== 'documented-residual') continue;
      for (const witness of adjudication.witnesses) {
        const rt1 = roundTrip(witness.input);
        expect(rt1).toBe(witness.roundTrip);
        expect(roundTrip(rt1)).toBe(rt1);
      }
    }
  });
});

describe('parser-drop closure - preprocess transforms', () => {
  test('the extracted transform surface is fully adjudicated with no stale entries', () => {
    const extracted = extractPreprocessTransforms(preprocessSource);
    expect(extracted.hasBomHeadCheck).toBe(true);
    const computed = [...extracted.transformChars, 'bom-head-check'];
    const result = checkClosure(computed, PREPROCESS_TRANSFORM_ADJUDICATIONS);
    expect(result.unadjudicated).toEqual([]);
    expect(result.stale).toEqual([]);
  });

  test('the resolved preprocess source matches the pinned hash (a bump re-fires adjudication)', () => {
    const hash = new Bun.CryptoHasher('sha256').update(preprocessSource).digest('hex');
    expect(
      hash,
      'micromark lib/preprocess.js changed. This pin exists to force re-review, not a blind ' +
        're-pin: diff the new preprocess source, re-review PREPROCESS_TRANSFORM_ADJUDICATIONS ' +
        'in parser-drop-closure.ts (every transform char + the BOM head-check must stay ' +
        `adjudicated), then set PINNED_PREPROCESS_SOURCE_SHA256 = '${hash}'.`,
    ).toBe(PINNED_PREPROCESS_SOURCE_SHA256);
  });

  test('the spec-mandated NUL replacement behaves exactly as pinned', () => {
    for (const adjudication of Object.values(PREPROCESS_TRANSFORM_ADJUDICATIONS)) {
      if (adjudication.kind !== 'spec-mandated-replacement') continue;
      expect(roundTrip(adjudication.witness.input)).toBe(adjudication.witness.roundTrip);
    }
  });
});

describe('parser-drop closure - non-vacuity (tamper)', () => {
  test('removing one adjudication reports that token as unadjudicated', () => {
    const dropped = computeDroppedTokenTypes();
    const { lineSuffix: _omitted, ...rest } = DROPPED_TOKEN_ADJUDICATIONS;
    const result = checkClosure(dropped, rest);
    expect(result.unadjudicated).toEqual(['lineSuffix']);
  });

  test('an adjudication for a token no longer dropped reports as stale', () => {
    const dropped = computeDroppedTokenTypes();
    const result = checkClosure(dropped, {
      ...DROPPED_TOKEN_ADJUDICATIONS,
      paragraph: { kind: 'structural-only', rationale: 'planted stale entry' },
    });
    expect(result.stale).toEqual(['paragraph']);
  });

  test('the extractors fail loudly when the upstream source shape changes', () => {
    expect(() => extractFromMarkdownHandlerKeys('nothing here')).toThrow();
    expect(() => extractPreprocessTransforms('nothing here')).toThrow();
  });
});
