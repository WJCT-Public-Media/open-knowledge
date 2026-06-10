import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared.ts';
import {
  collectExtensionHandlerKeys,
  computeShadowedHandlerKeys,
  HANDLER_SHADOW_ADJUDICATIONS,
  type HandlerShadowWitness,
} from './handler-shadow-audit.ts';
import { MarkdownManager } from './index.ts';
import { createSerializeProcessor } from './pipeline.ts';
import { toMarkdownHandlers } from './to-markdown-handlers.ts';

const md = new MarkdownManager({ extensions: sharedExtensions });
const roundTrip = (source: string) => md.serialize(md.parse(source));

function computeLiveShadowedKeys(): string[] {
  const processor = createSerializeProcessor({});
  const extensions = processor.data('toMarkdownExtensions');
  if (!Array.isArray(extensions) || extensions.length === 0) {
    throw new Error('serialize processor registered no toMarkdown extensions');
  }
  return computeShadowedHandlerKeys(
    collectExtensionHandlerKeys(extensions),
    Object.keys(toMarkdownHandlers),
  );
}

describe('handler-shadow audit - closure', () => {
  test('every shadowed handler key carries an adjudication and none is stale', () => {
    const shadowed = computeLiveShadowedKeys();
    expect(shadowed.length).toBeGreaterThan(0);
    const adjudicated = Object.keys(HANDLER_SHADOW_ADJUDICATIONS).sort();
    expect(shadowed).toEqual(adjudicated);
  });

  test('the known shadow surface is exactly the six adjudicated keys', () => {
    expect(computeLiveShadowedKeys()).toEqual([
      'delete',
      'inlineCode',
      'inlineMath',
      'mdxJsxFlowElement',
      'mdxJsxTextElement',
      'table',
    ]);
  });
});

describe('handler-shadow audit - live witnesses', () => {
  test('every adjudication witness round-trips byte-exactly through the real engine', () => {
    const runWitness = (key: string, witness: HandlerShadowWitness): void => {
      const out = roundTrip(witness.input);
      expect(
        out === witness.input || out === `${witness.input}\n`,
        `${key} witness drifted: ${JSON.stringify(witness.input)} -> ${JSON.stringify(out)}`,
      ).toBe(true);
      if (witness.expect === 'byte-and-reparse-type') {
        const reparsed = md.parseToMdast(out) as { children?: Array<{ type: string }> };
        expect(reparsed.children?.[0]?.type).toBe(witness.reparseType ?? '');
      }
    };
    for (const [key, adjudication] of Object.entries(HANDLER_SHADOW_ADJUDICATIONS)) {
      expect(adjudication.witnesses.length).toBeGreaterThan(0);
      for (const witness of adjudication.witnesses) runWitness(key, witness);
    }
  });
});

describe('handler-shadow audit - non-vacuity (tamper)', () => {
  test('removing the inlineCode (table-cell pipe re-escape) adjudication fails the closure', () => {
    const shadowed = computeLiveShadowedKeys();
    const { inlineCode: _omitted, ...rest } = HANDLER_SHADOW_ADJUDICATIONS;
    expect(shadowed).not.toEqual(Object.keys(rest).sort());
    const missing = shadowed.filter((key) => !(key in rest));
    expect(missing).toEqual(['inlineCode']);
  });

  test('a planted adjudication for an unshadowed key is detected as stale', () => {
    const shadowed = new Set(computeLiveShadowedKeys());
    const planted = {
      ...HANDLER_SHADOW_ADJUDICATIONS,
      paragraph: HANDLER_SHADOW_ADJUDICATIONS.delete,
    };
    const stale = Object.keys(planted).filter((key) => !shadowed.has(key));
    expect(stale).toEqual(['paragraph']);
  });

  test('the key collector sees through nested extension arrays', () => {
    const keys = collectExtensionHandlerKeys([
      {
        extensions: [
          { handlers: { alpha: () => '' } },
          { extensions: [{ handlers: { beta: () => '' } }] },
        ],
      },
      { handlers: { gamma: () => '' } },
    ]);
    expect(keys).toEqual(['alpha', 'beta', 'gamma']);
  });
});
