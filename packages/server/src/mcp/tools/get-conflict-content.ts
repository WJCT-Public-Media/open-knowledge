
import { z } from 'zod';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpGet,
  outputSchemaWithText,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  textPlusStructured,
  textResult,
} from './shared.ts';

export const DESCRIPTION = [
  "[Requires: Hocuspocus server] Fetch the three merge stages (base / ours / theirs) for a doc currently in a merge-conflict state, plus the doc's lifecycle status and the conflict shape discriminator.",
  'Returns 404 if no conflict is tracked for the path.',
  'The `ours` field is sourced from the live Y.Text (showing any pre-conflict unflushed user edits) when the doc is loaded server-side; falls back to `git show :2:<file>` otherwise.',
  'The `kind` field discriminates conflict shape: `both-modified` (both sides edited the file), `delete-modify` (DU — you deleted, they edited; stage 2 absent, `ours` empty), or `modify-delete` (UD — you edited, they deleted; stage 3 absent, `theirs` empty). Use it to pick the right `resolve_conflict` strategy: both-modified accepts `mine`/`theirs`/`content`; delete-modify accepts `delete` (keep deletion) or `theirs` (restore); modify-delete accepts `mine` (keep your version) or `delete` (accept their deletion).',
  '',
  '**Parameters:**',
  '- `file` — Relative-to-projectDir path WITH the `.md` extension (e.g. `notes/sso.md`). Mirrors the server-side wire contract.',
].join('\n');

interface GetConflictContentDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
}

const OutputSchema = outputSchemaWithText({
  file: z.string(),
  base: z.string(),
  ours: z.string(),
  theirs: z.string(),
  kind: z.enum(['both-modified', 'delete-modify', 'modify-delete']),
  lifecycleStatus: z.string().nullable(),
});

export function register(server: ServerInstance, deps: GetConflictContentDeps): void {
  server.registerTool(
    'get_conflict_content',
    {
      description: DESCRIPTION,
      inputSchema: {
        file: z
          .string()
          .min(1)
          .describe(
            'Relative-to-projectDir path WITH .md extension (e.g. `notes/sso.md`). Server-side contract — do NOT strip the extension.',
          ),
        cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
      },
      outputSchema: OutputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (args: { file: string; cwd?: string }) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);

      const query = `?file=${encodeURIComponent(args.file)}&source=ytext`;
      const result = await httpGet(url, `/api/sync/conflict-content${query}`);
      if (!result.ok) {
        const error = result.error as string;
        const detail = typeof result.detail === 'string' ? result.detail : undefined;
        const message = detail ? `${error} — ${detail}` : error;
        return textResult(`Error: ${message}`, true);
      }

      const rec = result as Record<string, unknown>;
      const file = typeof rec.file === 'string' ? rec.file : args.file;
      const base = typeof rec.base === 'string' ? rec.base : '';
      const ours = typeof rec.ours === 'string' ? rec.ours : '';
      const theirs = typeof rec.theirs === 'string' ? rec.theirs : '';
      const kind: 'both-modified' | 'delete-modify' | 'modify-delete' =
        rec.kind === 'delete-modify' || rec.kind === 'modify-delete' ? rec.kind : 'both-modified';
      const lifecycleStatus = typeof rec.lifecycleStatus === 'string' ? rec.lifecycleStatus : null;
      const structured = { file, base, ours, theirs, kind, lifecycleStatus };
      const lifecycleSuffix = lifecycleStatus ? ` (lifecycle: ${lifecycleStatus})` : '';
      const text = `Conflict stages for ${file} (kind: ${kind})${lifecycleSuffix}:\n--- base ---\n${base}\n--- ours ---\n${ours}\n--- theirs ---\n${theirs}`;
      return textPlusStructured(text, structured);
    },
  );
}
