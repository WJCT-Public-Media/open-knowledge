import { beforeAll, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MENU_LABELS } from '@inkeep/open-knowledge-core';

function collectStrings(node: unknown, out: Set<string>): void {
  if (typeof node === 'string') {
    out.add(node);
  } else if (Array.isArray(node)) {
    for (const child of node) collectStrings(child, out);
  } else if (node && typeof node === 'object') {
    for (const child of Object.values(node)) collectStrings(child, out);
  }
}

const catalogStrings = new Set<string>();

beforeAll(() => {
  const catalog = JSON.parse(
    readFileSync(join(import.meta.dir, '..', 'locales', 'en', 'messages.json'), 'utf8'),
  ) as { messages: Record<string, unknown> };
  collectStrings(catalog.messages, catalogStrings);
});

describe('shared menu labels stay in sync between the native menu and the renderer', () => {
  for (const [key, label] of Object.entries(MENU_LABELS)) {
    it(`renderer catalog contains MENU_LABELS.${key} ("${label}")`, () => {
      expect(catalogStrings.has(label)).toBe(true);
    });
  }
});
