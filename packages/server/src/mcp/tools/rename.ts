
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { AgentIdentity } from '../agent-identity.ts';
import { resolveWithinRoot } from './path-safety.ts';
import { type PreviewUrlSource, resolvePreviewUrlForTool } from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpPost,
  normalizeDocName,
  parseRenameCollidingPairs,
  type RenameCollisionPair,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  summaryArgSchema,
  textPlusStructured,
  textResult,
} from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Rename a doc or a folder through the managed rename flow at `POST /api/rename-path`. The tool probes the content directory to decide whether `from` is a doc or a folder, then sets `kind` (`file` vs `folder`) accordingly. Renaming rewrites inbound wiki-links plus supported internal inline Markdown links across affected docs.',
  '',
  '**Parameters:**',
  '- `from` — Source path. For a doc, the docName (typically without extension; trailing `.md`/`.mdx` is stripped). For a folder, the folder path relative to the content directory with no leading/trailing slash (e.g. `notes/drafts`).',
  '- `to` — Destination path. Same shape as `from`. For a folder rename, parent directories are auto-created.',
  '- `summary` — Optional one-line user-outcome description (≤80 chars). If omitted, defaults to "Renamed X → Y". Appears as a bullet in the timeline. Avoid secrets or PII — summaries persist to git history.',
  '',
  '**Output:**',
  '- Doc rename — `{previewUrl, previousPreviewUrl?, renamed, rewrittenDocs, ...}`.',
  '- Folder rename — `{previewUrls: Record<newDocName, url>, renamed, rewrittenDocs, ...}`.',
  '',
  '**Errors:**',
  '- 400 — destination excluded by `.gitignore` / `.okignore`; invalid path shape.',
  '- 404 — source doc or folder does not exist.',
  '- 409 — destination already exists; server returns a structured `colliding[]` list in this case.',
].join('\n');

interface RenameMapping {
  fromDocName: string;
  toDocName: string;
}

interface RenameRewrittenDoc {
  docName: string;
  rewrites: number;
}

interface RenameFileSuccess {
  ok: true;
  kind: 'file';
  renamed: RenameMapping[];
  rewrittenDocs: RenameRewrittenDoc[];
  previewUrl: string | null;
  previewUrlSource?: PreviewUrlSource;
  previousPreviewUrl?: string;
  summary?: { value: string; truncatedFrom?: number; hint?: string };
}

interface RenameFolderSuccess {
  ok: true;
  kind: 'folder';
  renamed: RenameMapping[];
  rewrittenDocs: RenameRewrittenDoc[];
  previewUrls: Record<string, string>;
  previewUrlSource?: PreviewUrlSource;
  summary?: { value: string; truncatedFrom?: number; hint?: string };
}

interface RenameError {
  ok: false;
  error: string;
  colliding?: RenameCollisionPair[];
}

export interface RenameDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
  /** Same identity passthrough pattern as write-document. Without this,
   *  MCP-driven renames post no agentId → the server-side guard skips
   *  attribution, so summaries would have no contributor entry to live on. */
  identityRef?: { current: AgentIdentity };
}

interface RenameArgs {
  from: string;
  to: string;
  summary?: string;
  cwd?: string;
}

function parseRenameMappings(value: unknown): RenameMapping[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { fromDocName, toDocName } = entry as Record<string, unknown>;
    return typeof fromDocName === 'string' && typeof toDocName === 'string'
      ? [{ fromDocName, toDocName }]
      : [];
  });
}

function parseRewrittenDocs(value: unknown): RenameRewrittenDoc[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { docName, rewrites } = entry as Record<string, unknown>;
    return typeof docName === 'string' && typeof rewrites === 'number'
      ? [{ docName, rewrites }]
      : [];
  });
}

function isValidFolderPath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (path.startsWith('/') || path.endsWith('/')) return false;
  if (path.includes('..')) return false;
  return true;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function resolveRenameKind(contentDir: string, from: string): 'file' | 'folder' | null {
  const contained = resolveWithinRoot(contentDir, from);
  if (!contained.ok) return null;
  const absBase = contained.abs;
  if (existsSync(absBase)) {
    try {
      const stat = statSync(absBase);
      if (stat.isDirectory()) return 'folder';
      if (stat.isFile() && (absBase.endsWith('.md') || absBase.endsWith('.mdx'))) return 'file';
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EACCES' || code === 'EPERM') return 'file';
    }
  }
  for (const ext of ['.md', '.mdx']) {
    if (existsSync(`${absBase}${ext}`)) return 'file';
  }
  return null;
}

export function register(server: ServerInstance, deps: RenameDeps): void {
  server.registerTool(
    'rename',
    {
      description: DESCRIPTION,
      inputSchema: {
        from: z
          .string()
          .describe(
            'Current path. Doc: docName (typically extensionless). Folder: relative path with no leading/trailing slash.',
          ),
        to: z
          .string()
          .describe(
            'New path. Doc: docName (typically extensionless). Folder: relative path with no leading/trailing slash.',
          ),
        summary: summaryArgSchema.describe(
          'Optional one-line user-outcome description (≤80 chars). Defaults to "Renamed X → Y" when omitted. Persisted to git history.',
        ),
        cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
      },
    },
    async (args: RenameArgs) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, config, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);

      const contentDir = join(cwd, config.content.dir);
      const kind = resolveRenameKind(contentDir, args.from);
      if (kind === null) {
        return textResult(
          `Error: \`${args.from}\` does not exist as a doc or folder under the content directory.`,
          true,
        );
      }

      if (kind === 'file') {
        return handleFileRename(args, url, cwd, deps);
      }
      return handleFolderRename(args, url, cwd, deps);
    },
  );
}

async function handleFileRename(args: RenameArgs, url: string, cwd: string, deps: RenameDeps) {
  const normalizedFrom = normalizeDocName(args.from);
  if (!normalizedFrom.ok) return textResult(normalizedFrom.error, true);
  const normalizedTo = normalizeDocName(args.to);
  if (!normalizedTo.ok) return textResult(normalizedTo.error, true);

  const identity = deps.identityRef?.current;
  const result = await httpPost(url, '/api/rename-path', {
    kind: 'file',
    fromPath: normalizedFrom.docName,
    toPath: normalizedTo.docName,
    ...(args.summary !== undefined ? { summary: args.summary } : {}),
    ...(identity
      ? {
          agentId: identity.connectionId,
          agentName: identity.displayName,
          clientName: identity.clientInfo?.name,
          colorSeed: identity.colorSeed,
        }
      : {}),
  });

  if (!result.ok) {
    const error = result.error as string;
    const colliding = parseRenameCollidingPairs(result.colliding);
    const structured: RenameError = {
      ok: false,
      error,
      ...(colliding.length > 0 ? { colliding } : {}),
    };
    return textPlusStructured(`Error: ${error}`, structured, true);
  }

  const renamed = parseRenameMappings(result.renamed);
  const rewrittenDocs = parseRewrittenDocs(result.rewrittenDocs);
  const renamedSummary =
    renamed.map(({ fromDocName, toDocName }) => `${fromDocName} -> ${toDocName}`).join(', ') ||
    `${normalizedFrom.docName} -> ${normalizedTo.docName}`;
  const rewrittenSummary =
    rewrittenDocs.length === 0
      ? 'No inbound links required updates.'
      : `Rewrote ${rewrittenDocs.length} ${pluralize(rewrittenDocs.length, 'document')}.`;

  const previewDeps = { config: deps.config, resolveCwd: deps.resolveCwd };
  const newPreview = await resolvePreviewUrlForTool(normalizedTo.docName, previewDeps, cwd);
  const oldPreview = await resolvePreviewUrlForTool(normalizedFrom.docName, previewDeps, cwd);

  const summaryResult =
    result.summary && typeof result.summary === 'object'
      ? (result.summary as { value: string; truncatedFrom?: number; hint?: string })
      : undefined;
  const summaryHint = typeof summaryResult?.hint === 'string' ? summaryResult.hint : undefined;

  const structured: RenameFileSuccess = {
    ok: true,
    kind: 'file',
    renamed,
    rewrittenDocs,
    previewUrl: newPreview?.url ?? null,
    ...(newPreview ? { previewUrlSource: newPreview.source } : {}),
    ...(oldPreview ? { previousPreviewUrl: oldPreview.url } : {}),
    ...(summaryResult ? { summary: summaryResult } : {}),
  };

  const textLines = [`Renamed ${renamedSummary}. ${rewrittenSummary}`];
  if (summaryHint) textLines.push(summaryHint);
  return textPlusStructured(textLines.join('\n'), structured);
}

async function handleFolderRename(args: RenameArgs, url: string, cwd: string, deps: RenameDeps) {
  if (!isValidFolderPath(args.from)) {
    return textResult(
      'Error: `from` must be a relative path with no leading/trailing slash.',
      true,
    );
  }
  if (!isValidFolderPath(args.to)) {
    return textResult('Error: `to` must be a relative path with no leading/trailing slash.', true);
  }

  const identity = deps.identityRef?.current;
  const result = await httpPost(url, '/api/rename-path', {
    kind: 'folder',
    fromPath: args.from,
    toPath: args.to,
    ...(args.summary !== undefined ? { summary: args.summary } : {}),
    ...(identity
      ? {
          agentId: identity.connectionId,
          agentName: identity.displayName,
          clientName: identity.clientInfo?.name,
          colorSeed: identity.colorSeed,
        }
      : {}),
  });

  if (!result.ok) {
    const error = result.error as string;
    const colliding = parseRenameCollidingPairs(result.colliding);
    const structured: RenameError = {
      ok: false,
      error,
      ...(colliding.length > 0 ? { colliding } : {}),
    };
    return textPlusStructured(`Error: ${error}`, structured, true);
  }

  const renamed = parseRenameMappings(result.renamed);
  const rewrittenDocs = parseRewrittenDocs(result.rewrittenDocs);

  const previewDeps = { config: deps.config, resolveCwd: deps.resolveCwd };
  const previewUrls: Record<string, string> = {};
  let previewUrlSource: PreviewUrlSource | undefined;
  for (const { toDocName } of renamed) {
    const preview = await resolvePreviewUrlForTool(toDocName, previewDeps, cwd);
    if (preview) {
      previewUrls[toDocName] = preview.url;
      previewUrlSource ??= preview.source;
    }
  }

  const summaryResult =
    result.summary && typeof result.summary === 'object'
      ? (result.summary as { value: string; truncatedFrom?: number; hint?: string })
      : undefined;
  const summaryHint = typeof summaryResult?.hint === 'string' ? summaryResult.hint : undefined;

  const structured: RenameFolderSuccess = {
    ok: true,
    kind: 'folder',
    renamed,
    rewrittenDocs,
    previewUrls,
    ...(previewUrlSource ? { previewUrlSource } : {}),
    ...(summaryResult ? { summary: summaryResult } : {}),
  };

  const textLines: string[] = [];
  if (renamed.length === 0) {
    textLines.push(
      `No managed docs under ${args.from}/ — nothing to rename. Empty folders are not tracked; create a doc inside the folder first.`,
    );
  } else {
    textLines.push(
      `Renamed folder ${args.from}/ → ${args.to}/ (${renamed.length} doc${
        renamed.length === 1 ? '' : 's'
      }, ${rewrittenDocs.length} rewrite${rewrittenDocs.length === 1 ? '' : 's'}).`,
    );
  }
  if (summaryHint) textLines.push(summaryHint);
  return textPlusStructured(textLines.join('\n'), structured);
}
