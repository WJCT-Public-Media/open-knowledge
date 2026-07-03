import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteFileSync } from '@inkeep/open-knowledge-core/server';
import {
  getNodeValue,
  type Node as JsoncNode,
  type ParseError as JsoncParseError,
  parseTree,
} from 'jsonc-parser';
import { isObject } from '../utils/is-object.ts';
import { LAUNCH_CONFIG_NAME } from './init.ts';
import { existingFileMode, surgicalJsonDelete } from './jsonc-surgical.ts';

export type LaunchRemoveOutcome =
  | { kind: 'removed' }
  | { kind: 'removed-file' }
  | { kind: 'not-present' }
  | { kind: 'declined' };

const JSONC_PARSE_OPTIONS = { allowTrailingComma: true, disallowComments: false };

const JSONC_INVALID_SYMBOL_CODE = 1;
function isBenignBomError(error: JsoncParseError, raw: string): boolean {
  return (
    error.error === JSONC_INVALID_SYMBOL_CODE && error.offset === 0 && raw.charCodeAt(0) === 0xfeff
  );
}

export function removeOwnLaunchEntry(projectRoot: string): LaunchRemoveOutcome {
  const configPath = join(projectRoot, '.claude', 'launch.json');
  if (!existsSync(configPath)) return { kind: 'not-present' };

  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf-8');
  } catch {
    return { kind: 'declined' };
  }

  const errors: JsoncParseError[] = [];
  const tree: JsoncNode | undefined = parseTree(raw, errors, JSONC_PARSE_OPTIONS) ?? undefined;
  if (errors.some((e) => !isBenignBomError(e, raw))) return { kind: 'declined' };
  if (!tree || tree.type !== 'object') return { kind: 'declined' };

  const root = getNodeValue(tree) as Record<string, unknown>;
  const configs = root.configurations;
  if (!Array.isArray(configs)) return { kind: 'not-present' };

  const index = configs.findIndex(
    (c) => isObject(c) && (c as Record<string, unknown>).name === LAUNCH_CONFIG_NAME,
  );
  if (index === -1) return { kind: 'not-present' };

  if (configs.length === 1) {
    rmSync(configPath, { force: true });
    return { kind: 'removed-file' };
  }

  const { text, changed } = surgicalJsonDelete(raw, ['configurations', index]);
  if (!changed) return { kind: 'not-present' };
  atomicWriteFileSync(configPath, text, { mode: existingFileMode(configPath) });
  return { kind: 'removed' };
}
