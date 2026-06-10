import { describe, expect, test } from 'bun:test';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { updateYFragment } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { AGENT_WRITE_ORIGIN } from './agent-sessions.ts';
import { composeAndWriteRawBody } from './bridge-intake.ts';
import { setupServerObservers } from './server-observers.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

const USER_TYPING_ORIGIN = {
  source: 'connection' as const,
  context: { origin: 'user-typing' },
};

interface AgentThenWysiwygResult {
  readonly afterAgent: string;
  readonly afterWysiwyg: string;
}

function agentWriteThenWysiwygTouch(raw: string): AgentThenWysiwygResult {
  const doc = new Y.Doc();
  const xmlFragment = doc.getXmlFragment('default');
  const ytext = doc.getText('source');
  const cleanup = setupServerObservers({ doc, xmlFragment, ytext, mdManager, schema });

  doc.transact(() => {
    composeAndWriteRawBody(doc, raw, 'agent');
  }, AGENT_WRITE_ORIGIN);
  const afterAgent = ytext.toString();

  doc.transact(() => {
    const para = new Y.XmlElement('paragraph');
    para.insert(0, [new Y.XmlText('x')]);
    xmlFragment.insert(xmlFragment.length, [para]);
  }, USER_TYPING_ORIGIN);
  const afterWysiwyg = ytext.toString();

  cleanup();
  return { afterAgent, afterWysiwyg };
}

describe('PRD-6654 — agent bytes survive a concurrent non-paired WYSIWYG edit', () => {
  describe('canonical-form controls (serializer retention; pass on either Path-A variant)', () => {
    test('under-padded table row in a padded table round-trips byte-exact through serialize(parse)', () => {
      const rawTable = [
        '# Trace',
        '',
        '| Step | Time | Note                          | Status    |',
        '| ---- | ---- | ----------------------------- | --------- |',
        '| 5 | T+5s | Your browser edits survived! | CONFIRMED |',
        '',
      ].join('\n');
      expect(mdManager.serialize(mdManager.parse(rawTable))).toBe(rawTable);
    });

    test('narrow row appended to a wide-padded table round-trips byte-exact through serialize(parse)', () => {
      const composed =
        '| step | description                                | status |\n' +
        '| ---- | ------------------------------------------ | ------ |\n' +
        '| 1    | This is a really really long row of stuff  | DONE   |\n' +
        '| 3 | short row | OK |\n';
      expect(mdManager.serialize(mdManager.parse(composed))).toBe(composed);
    });

    test('agent table row with under-padded columns stays verbatim after a WYSIWYG touch', () => {
      const agentRow = '| 5 | T+5s | Your browser edits survived! | CONFIRMED |';
      const rawTable = [
        '# Trace',
        '',
        '| Step | Time | Note                          | Status    |',
        '| ---- | ---- | ----------------------------- | --------- |',
        agentRow,
        '',
      ].join('\n');

      const { afterAgent, afterWysiwyg } = agentWriteThenWysiwygTouch(rawTable);
      expect(afterAgent).toBe(rawTable);
      expect(afterWysiwyg.includes(agentRow)).toBe(true);
    });

    test('end-to-end find flow: indexOf of the agent-composed row succeeds after a WYSIWYG touch', () => {
      const findTarget = '| 5 | T+5s | Your browser edits survived! | CONFIRMED |';
      const initial = [
        '# Trace',
        '',
        '| Step | Time | Note                          | Status    |',
        '| ---- | ---- | ----------------------------- | --------- |',
        findTarget,
        '',
      ].join('\n');

      const { afterWysiwyg } = agentWriteThenWysiwygTouch(initial);
      expect(afterWysiwyg.indexOf(findTarget)).not.toBe(-1);
    });
  });

  describe('splice discriminators (require the map-driven Path A; fail under whole-body line diff)', () => {
    test('table row WITHOUT trailing pipe stays verbatim when the WYSIWYG edit is in another block', () => {
      const raw = '# Notes\n\n| a | b |\n| - | - |\n| 1 | 2\n';
      const { afterAgent, afterWysiwyg } = agentWriteThenWysiwygTouch(raw);

      expect(afterAgent).toBe(raw);
      expect(mdManager.serialize(mdManager.parse(raw))).not.toBe(raw);
      expect(afterWysiwyg.indexOf('| 1 | 2\n')).not.toBe(-1);
    });

    test('multi-blank-line block separator stays verbatim when the WYSIWYG edit is in another block', () => {
      const raw = '# H\n\na\n\n\n\nb\n';
      const { afterAgent, afterWysiwyg } = agentWriteThenWysiwygTouch(raw);

      expect(afterAgent).toBe(raw);
      expect(afterWysiwyg.indexOf('a\n\n\n\nb')).not.toBe(-1);
    });

    test('leading blank lines stay verbatim when the WYSIWYG edit is in another block', () => {
      const raw = '\n\n## Section\n\nLorem ipsum.\n';
      const { afterAgent, afterWysiwyg } = agentWriteThenWysiwygTouch(raw);

      expect(afterAgent).toBe(raw);
      expect(afterWysiwyg.startsWith('\n\n## Section')).toBe(true);
    });
  });

  describe('row-no-trailing-pipe tolerance (Observer A already-in-sync gate + watchdog)', () => {
    const UNIFORM = '# Notes\n\n| a | b\n| - | -\n| 1 | 2\n';

    function stripTableCaptureAttrs(json: unknown): void {
      if (!json || typeof json !== 'object') return;
      const node = json as {
        type?: string;
        attrs?: Record<string, unknown>;
        content?: unknown[];
      };
      if (node.type === 'table' && node.attrs) {
        node.attrs.sourceOuterPipes = null;
      }
      for (const child of node.content ?? []) stripTableCaptureAttrs(child);
    }

    function rebuildFragmentFrom(
      doc: Y.Doc,
      xmlFragment: Y.XmlFragment,
      json: Record<string, unknown>,
    ): void {
      const pmNode = schema.nodeFromJSON(json);
      doc.transact(() => {
        const meta = { mapping: new Map(), isOMark: new Map() };
        updateYFragment(doc, xmlFragment, pmNode, meta);
      }, USER_TYPING_ORIGIN);
    }

    test('attr-only fragment churn (capture attrs lost, zero content change) leaves Y.Text byte-identical', () => {
      const doc = new Y.Doc();
      const xmlFragment = doc.getXmlFragment('default');
      const ytext = doc.getText('source');
      const cleanup = setupServerObservers({ doc, xmlFragment, ytext, mdManager, schema });

      doc.transact(() => {
        composeAndWriteRawBody(doc, UNIFORM, 'agent');
      }, AGENT_WRITE_ORIGIN);
      expect(ytext.toString()).toBe(UNIFORM);

      const stripped = mdManager.parse(UNIFORM) as unknown as Record<string, unknown>;
      stripTableCaptureAttrs(stripped);
      rebuildFragmentFrom(doc, xmlFragment, stripped);

      expect(ytext.toString()).toBe(UNIFORM);
      expect(ytext.toString().indexOf('| 1 | 2\n')).not.toBe(-1);

      cleanup();
    });

    test('source-mode typed no-trailing-pipe table settles without a bridge-invariant violation', () => {
      const doc = new Y.Doc();
      const xmlFragment = doc.getXmlFragment('default');
      const ytext = doc.getText('source');
      const cleanup = setupServerObservers({ doc, xmlFragment, ytext, mdManager, schema });

      const raw = '# Notes\n\n| a | b |\n| - | - |\n| 1 | 2\n';
      doc.transact(
        () => {
          ytext.insert(0, raw);
        },
        {
          source: 'connection' as const,
          context: { origin: 'source-typing' },
        },
      );

      expect(ytext.toString()).toBe(raw);

      cleanup();
    });

    test('genuine cell edit through the same attr-churn path still syncs (not absorbed by the tolerance)', () => {
      const doc = new Y.Doc();
      const xmlFragment = doc.getXmlFragment('default');
      const ytext = doc.getText('source');
      const cleanup = setupServerObservers({ doc, xmlFragment, ytext, mdManager, schema });

      doc.transact(() => {
        composeAndWriteRawBody(doc, UNIFORM, 'agent');
      }, AGENT_WRITE_ORIGIN);

      const edited = mdManager.parse(UNIFORM.replace('| 1 | 2', '| 1 | 99')) as unknown as Record<
        string,
        unknown
      >;
      stripTableCaptureAttrs(edited);
      rebuildFragmentFrom(doc, xmlFragment, edited);

      expect(ytext.toString()).toContain('99');

      cleanup();
    });
  });
});
