
import { z } from 'zod';
import { buildDiscoverBody } from './discover-body.ts';
import type { ConfigOrResolver, ServerInstance } from './shared.ts';
import {
  outputSchemaWithText,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectConfigContext,
  textPlusStructured,
  textResult,
} from './shared.ts';

export const DESCRIPTION = [
  'Returns a step-by-step plan for setting up an existing repo: extract folder conventions, write folder frontmatter + templates, activate the link graph. Does NOT execute the plan — you run it, with per-phase user confirmation.',
  '',
  'Invoke on first arrival at a repo that has markdown content but no folder frontmatter / templates (an `exec` listing shows no folder `title`/`description`/`tags` and empty `templates_available`). Skip empty repos (use `ok seed`) and already-configured ones. One-shot per project; idempotent on re-run (extends, never re-proposes).',
  '',
  'Phases 1-4 run fs-direct; Phase 5 (link-graph activation) needs `ok start`. Composes existing tools only — `exec`, `links`, `search`, `folder_config`, `edit_document`.',
].join('\n');

interface DiscoverDeps {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
}

const InputSchema = {
  cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
} as const;

const OutputSchema = outputSchemaWithText({
  previewUrl: z.null(),
});

export function register(server: ServerInstance, deps: DiscoverDeps): void {
  server.registerTool(
    'discover',
    {
      description: DESCRIPTION,
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
        destructiveHint: false,
      },
    },
    async (args: { cwd?: string }) => {
      const context = await resolveProjectConfigContext(deps.resolveCwd, deps.config, args.cwd);
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const body = buildDiscoverBody(context.config.content.dir);
      return textPlusStructured(body, { previewUrl: null });
    },
  );
}
