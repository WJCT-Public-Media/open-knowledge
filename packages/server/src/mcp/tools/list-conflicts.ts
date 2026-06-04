
import { ConflictEntrySchema } from '@inkeep/open-knowledge-core';
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
  '[Requires: Hocuspocus server] Enumerate every document currently tracked as in a merge-conflict state.',
  'Returns one entry per file (relative-path, detection timestamp, optional git SHAs). When no conflicts are tracked, returns `conflicts: []`.',
  '',
  'Use as the entry point to the conflict-resolution flow: `list_conflicts` to discover, `get_conflict_content` to inspect stages, `resolve_conflict` to write a chosen version.',
].join('\n');

interface ListConflictsDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
}

const OutputSchema = outputSchemaWithText({
  conflicts: z.array(ConflictEntrySchema),
});

export function register(server: ServerInstance, deps: ListConflictsDeps): void {
  server.registerTool(
    'list_conflicts',
    {
      description: DESCRIPTION,
      inputSchema: {
        cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
      },
      outputSchema: OutputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (args: { cwd?: string }) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);

      const result = await httpGet(url, '/api/sync/conflicts');
      if (!result.ok) {
        const error = result.error as string;
        return textPlusStructured(`Error: ${error}`, { conflicts: [] }, true);
      }
      const rawConflicts = (result as { conflicts?: unknown }).conflicts;
      const conflicts = Array.isArray(rawConflicts) ? rawConflicts : [];
      const text =
        conflicts.length === 0
          ? 'No conflicts tracked.'
          : `Tracked conflicts (${conflicts.length}):\n${conflicts
              .map((row) => {
                const file =
                  row && typeof row === 'object' && 'file' in row
                    ? String((row as Record<string, unknown>).file ?? '')
                    : '';
                return `- ${file}`;
              })
              .join('\n')}`;
      return textPlusStructured(text, { conflicts });
    },
  );
}
