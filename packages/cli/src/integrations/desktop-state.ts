import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type AppSupportOptions, resolveAppSupportPath } from '../commands/editors.ts';

export const DESKTOP_PRODUCT_NAME = 'OpenKnowledge';
/** Pre-rename `productName` (macOS legacy `Open Knowledge`, with a space). A
 *  generic name we don't own by name alone — always identity-gate before
 *  deleting its dir. */
export const DESKTOP_LEGACY_PRODUCT_NAME = 'Open Knowledge';

interface DesktopUserDataOptions extends AppSupportOptions {
  productName?: string;
}

export function desktopUserDataDir(options: DesktopUserDataOptions = {}): string {
  const productName = options.productName ?? DESKTOP_PRODUCT_NAME;
  return join(resolveAppSupportPath(options), productName);
}

export interface DesktopRecentProject {
  path: string;
  name: string;
}

function parseRecentProjects(raw: unknown): DesktopRecentProject[] | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const recentRaw = (raw as Record<string, unknown>).recentProjects;
  if (!Array.isArray(recentRaw)) return null;
  const projects: DesktopRecentProject[] = [];
  for (const entry of recentRaw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.path === 'string' && typeof item.name === 'string') {
      projects.push({ path: item.path, name: item.name });
    }
  }
  return projects;
}

export function readDesktopRecentProjects(userDataDir: string): DesktopRecentProject[] {
  const stateFile = join(userDataDir, 'state.json');
  if (!existsSync(stateFile)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(stateFile, 'utf-8'));
  } catch {
    return [];
  }
  return parseRecentProjects(parsed) ?? [];
}

export function stateDirIsOurs(userDataDir: string): boolean {
  const stateFile = join(userDataDir, 'state.json');
  if (!existsSync(stateFile)) return false;
  try {
    return parseRecentProjects(JSON.parse(readFileSync(stateFile, 'utf-8'))) !== null;
  } catch {
    return false;
  }
}
