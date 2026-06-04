
import { ORPHAN_MODES, type OrphanMode } from '@inkeep/open-knowledge-core';
import { z } from 'zod';
import { buildListResolver, type PreviewUrlDeps, resolvePreviewUrlForTool } from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpGet,
  normalizeDocName,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  textPlusStructured,
  textResult,
} from './shared.ts';

const LINK_KINDS = ['backlinks', 'forward', 'dead', 'orphans', 'hubs', 'suggest'] as const;
type LinkKind = (typeof LINK_KINDS)[number];

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Read the wiki-link graph. `kind` takes one value, or an array for a one-call audit — results merge into a single payload; any per-kind failure lands in an `errors` map.',
  '',
  '- `backlinks` / `forward` / `suggest` — operate on one page; require `docName`. `suggest` finds prose mentions of the page not yet wrapped in link syntax (each mention `offset` works with `edit_document`).',
  '- `dead` — missing internal link targets corpus-wide; optional `sourceDocNames` filter (OR semantics).',
  '- `orphans` — disconnected pages; optional `mode`: `incoming` | `outgoing` | `both`.',
  '- `hubs` — most-linked pages; optional `limit` (default 20).',
].join('\n');

interface BacklinksPayload {
  docName?: string;
  backlinks?: Array<Record<string, unknown> & { source?: string }>;
}

interface ForwardLinksPayload {
  docName?: string;
  forwardLinks?: Array<Record<string, unknown> & { kind?: string; docName?: string }>;
}

interface DeadLinksPayload {
  deadLinks?: Array<
    Record<string, unknown> & {
      target?: string;
      sources?: Array<Record<string, unknown> & { source?: string }>;
    }
  >;
}

interface OrphansPayload {
  orphans?: Array<Record<string, unknown> & { docName?: string }>;
}

interface HubsPayload {
  hubs?: Array<Record<string, unknown> & { docName?: string }>;
}

export interface LinksDeps extends PreviewUrlDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
}

interface LinksArgs {
  kind: LinkKind | LinkKind[];
  docName?: string;
  sourceDocNames?: string[];
  mode?: OrphanMode;
  limit?: number;
  cwd?: string;
}

type ListResolve = Awaited<ReturnType<typeof buildListResolver>>['resolve'];

type KindOutcome = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export function register(server: ServerInstance, deps: LinksDeps): void {
  server.registerTool(
    'links',
    {
      description: DESCRIPTION,
      inputSchema: {
        kind: z
          .union([z.enum(LINK_KINDS), z.array(z.enum(LINK_KINDS)).min(1)])
          .describe(
            'Link-graph view(s) to return — one kind, or an array to fetch several in one call (e.g. ["dead","orphans","hubs"] for a graph audit).',
          ),
        docName: z
          .string()
          .optional()
          .describe('Target page docName. Required for kind=backlinks|forward|suggest.'),
        sourceDocNames: z
          .array(z.string())
          .optional()
          .describe(
            'Referring source docs to narrow the audit with OR semantics. Used by kind=dead.',
          ),
        mode: z
          .enum(ORPHAN_MODES)
          .optional()
          .describe('Filter which type of graph disconnection to surface. Used by kind=orphans.'),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Maximum number of hubs to return. Used by kind=hubs.'),
        cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
      },
    },
    async (args: LinksArgs) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);

      const kinds = Array.isArray(args.kind) ? [...new Set(args.kind)] : [args.kind];
      const { resolve } = await buildListResolver(deps, cwd);

      const outcomes = await Promise.all(
        kinds.map((kind) => runKind(kind, args, url, cwd, deps, resolve)),
      );

      const merged: Record<string, unknown> = {};
      const errors: Record<string, string> = {};
      kinds.forEach((kind, i) => {
        const outcome = outcomes[i];
        if (outcome.ok) Object.assign(merged, outcome.data);
        else errors[kind] = outcome.error;
      });

      if (Object.keys(merged).length === 0) {
        const message =
          kinds.length === 1
            ? errors[kinds[0]]
            : `All requested link kinds failed: ${JSON.stringify(errors)}`;
        return textResult(message.startsWith('Error') ? message : `Error: ${message}`, true);
      }

      const structured = {
        ...merged,
        ...(Object.keys(errors).length > 0 ? { errors } : {}),
        cwd,
      };
      return textPlusStructured(JSON.stringify(structured, null, 2), structured);
    },
  );
}

function runKind(
  kind: LinkKind,
  args: LinksArgs,
  url: string,
  cwd: string,
  deps: LinksDeps,
  resolve: ListResolve,
): Promise<KindOutcome> {
  switch (kind) {
    case 'backlinks':
      return runBacklinks(args, url, resolve);
    case 'forward':
      return runForwardLinks(args, url, resolve);
    case 'dead':
      return runDeadLinks(args, url, resolve);
    case 'orphans':
      return runOrphans(args, url, resolve);
    case 'hubs':
      return runHubs(args, url, resolve);
    case 'suggest':
      return runSuggest(args, url, cwd, deps);
  }
}

async function runBacklinks(
  args: LinksArgs,
  url: string,
  resolve: ListResolve,
): Promise<KindOutcome> {
  if (!args.docName) return { ok: false, error: 'kind=backlinks requires `docName`.' };
  const normalized = normalizeDocName(args.docName);
  if (!normalized.ok) return { ok: false, error: normalized.error };
  const result = await httpGet(
    url,
    `/api/backlinks?docName=${encodeURIComponent(normalized.docName)}`,
  );
  if (!result.ok) return { ok: false, error: String(result.error) };
  const { ok: _ok, ...rest } = result;
  const data = rest as BacklinksPayload;
  const backlinks = (data.backlinks ?? []).map((row) => {
    const source = typeof row.source === 'string' ? row.source : null;
    const resolved = source ? resolve(source) : null;
    return {
      ...row,
      previewUrl: resolved?.url ?? null,
      ...(resolved ? { previewUrlSource: resolved.source } : {}),
    };
  });
  return { ok: true, data: { backlinks } };
}

async function runForwardLinks(
  args: LinksArgs,
  url: string,
  resolve: ListResolve,
): Promise<KindOutcome> {
  if (!args.docName) return { ok: false, error: 'kind=forward requires `docName`.' };
  const normalized = normalizeDocName(args.docName);
  if (!normalized.ok) return { ok: false, error: normalized.error };
  const result = await httpGet(
    url,
    `/api/forward-links?docName=${encodeURIComponent(normalized.docName)}`,
  );
  if (!result.ok) return { ok: false, error: String(result.error) };
  const { ok: _ok, ...rest } = result;
  const data = rest as ForwardLinksPayload;
  const forwardLinks = (data.forwardLinks ?? []).map((row) => {
    const docName = row.kind === 'doc' && typeof row.docName === 'string' ? row.docName : null;
    const resolved = docName ? resolve(docName) : null;
    return {
      ...row,
      previewUrl: resolved?.url ?? null,
      ...(resolved ? { previewUrlSource: resolved.source } : {}),
    };
  });
  return { ok: true, data: { forwardLinks } };
}

async function runDeadLinks(
  args: LinksArgs,
  url: string,
  resolve: ListResolve,
): Promise<KindOutcome> {
  const params = new URLSearchParams();
  for (const sourceDocName of args.sourceDocNames ?? []) {
    const normalized = normalizeDocName(sourceDocName);
    if (!normalized.ok) return { ok: false, error: normalized.error };
    params.append('sourceDocName', normalized.docName);
  }
  const query = params.toString();
  const result = await httpGet(url, `/api/dead-links${query ? `?${query}` : ''}`);
  if (!result.ok) return { ok: false, error: String(result.error) };
  const { ok: _ok, ...rest } = result;
  const data = rest as DeadLinksPayload;
  const deadLinks = (data.deadLinks ?? []).map((row) => {
    const target = typeof row.target === 'string' ? row.target : null;
    const resolvedTarget = target ? resolve(target) : null;
    const sources = (row.sources ?? []).map((sourceRow) => {
      const source = typeof sourceRow.source === 'string' ? sourceRow.source : null;
      const resolvedSource = source ? resolve(source) : null;
      return {
        ...sourceRow,
        previewUrl: resolvedSource?.url ?? null,
        ...(resolvedSource ? { previewUrlSource: resolvedSource.source } : {}),
      };
    });
    return {
      ...row,
      sources,
      previewUrl: resolvedTarget?.url ?? null,
      ...(resolvedTarget ? { previewUrlSource: resolvedTarget.source } : {}),
    };
  });
  return { ok: true, data: { deadLinks } };
}

async function runOrphans(
  args: LinksArgs,
  url: string,
  resolve: ListResolve,
): Promise<KindOutcome> {
  const query = args.mode ? `?mode=${encodeURIComponent(args.mode)}` : '';
  const result = await httpGet(url, `/api/orphans${query}`);
  if (!result.ok) return { ok: false, error: String(result.error) };
  const { ok: _ok, ...rest } = result;
  const data = rest as OrphansPayload;
  const orphans = (data.orphans ?? []).map((row) => {
    const docName = typeof row.docName === 'string' ? row.docName : null;
    const resolved = docName ? resolve(docName) : null;
    return {
      ...row,
      previewUrl: resolved?.url ?? null,
      ...(resolved ? { previewUrlSource: resolved.source } : {}),
    };
  });
  return { ok: true, data: { orphans } };
}

async function runHubs(args: LinksArgs, url: string, resolve: ListResolve): Promise<KindOutcome> {
  const query = args.limit ? `?limit=${encodeURIComponent(String(args.limit))}` : '';
  const result = await httpGet(url, `/api/hubs${query}`);
  if (!result.ok) return { ok: false, error: String(result.error) };
  const { ok: _ok, ...rest } = result;
  const data = rest as HubsPayload;
  const hubs = (data.hubs ?? []).map((row) => {
    const docName = typeof row.docName === 'string' ? row.docName : null;
    const resolved = docName ? resolve(docName) : null;
    return {
      ...row,
      previewUrl: resolved?.url ?? null,
      ...(resolved ? { previewUrlSource: resolved.source } : {}),
    };
  });
  return { ok: true, data: { hubs } };
}

async function runSuggest(
  args: LinksArgs,
  url: string,
  cwd: string,
  deps: LinksDeps,
): Promise<KindOutcome> {
  if (!args.docName) return { ok: false, error: 'kind=suggest requires `docName`.' };
  const normalized = normalizeDocName(args.docName);
  if (!normalized.ok) return { ok: false, error: normalized.error };
  const result = await httpGet(
    url,
    `/api/suggest-links?docName=${encodeURIComponent(normalized.docName)}`,
  );
  if (!result.ok) return { ok: false, error: String(result.error) };
  const { ok: _ok, ...data } = result;
  const preview = await resolvePreviewUrlForTool(
    normalized.docName,
    { config: deps.config, resolveCwd: deps.resolveCwd },
    cwd,
  );
  return {
    ok: true,
    data: {
      suggest: {
        ...data,
        previewUrl: preview?.url ?? null,
        ...(preview ? { previewUrlSource: preview.source } : {}),
      },
    },
  };
}
