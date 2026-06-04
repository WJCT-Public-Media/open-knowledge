
import { z } from 'zod';
import { resolveLockDir } from '../../config/paths.ts';
import { armPaneTarget } from '../../pane-target.ts';
import {
  encodeDocName,
  encodeFolderRoute,
  type PreviewUrlContext,
  resolveUiInfo,
} from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance } from './shared.ts';
import {
  outputSchemaWithText,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectConfigContext,
  textPlusStructured,
} from './shared.ts';

export const DESCRIPTION = [
  '[Operates on disk; no running OK server required] Resolve the browser-reachable preview URL for an Open Knowledge project (optionally for a specific doc).',
  '',
  'Per-response `previewUrl` fields on read/write tools are ROUTE-ONLY (`/#/<doc>`, no host:port) — they identify which doc to preview, not a URL to open by itself. Call this tool to get the full, openable URL.',
  '',
  'Use this when YOUR host opens the URL itself: navigate your in-app browser to the returned `url`, or — only on a stdio host with no browser tool — `open` it in the system browser. Hosts with a preview pane (Claude Code Desktop) call `preview_start("open-knowledge-ui")` instead; the Claude Code CLI uses `ok open <doc>` to open in the OK Desktop app.',
  '',
  'Returns `{ url, baseUrl, running: false }` and a recovery hint when no UI is running for the project (start one with `ok ui`).',
  '',
  '**Parameters:**',
  '- `docName` (optional) — Extension-less doc path (e.g. `specs/foo/SPEC`). Omit for the UI root URL.',
  '- `folder` (optional) — Folder path (e.g. `specs/foo`); returns the `…/#/<folder>/` route. Mutually exclusive with `docName`.',
  '- `armPaneTarget` (optional) — When true with a `docName`/`folder`, writes a small TTL-bounded (~30s) state file under `.ok/local/` so a later Claude-pane base-open lands on that target. This is the tool’s ONLY side effect; omit it and the call is read-only.',
  '- `cwd` (optional) — Project root (see `cwd` description below).',
].join('\n');

interface GetPreviewUrlDeps {
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
}

const InputSchema = {
  docName: z
    .string()
    .optional()
    .describe(
      'Extension-less doc path to resolve a preview URL for (e.g. "specs/foo/SPEC"). Omit to get the UI root URL.',
    ),
  folder: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Folder path to resolve a folder-route preview URL for (e.g. "specs/foo"); returns the `…/#/<folder>/` route. Mutually exclusive with `docName`.',
    ),
  armPaneTarget: z
    .boolean()
    .optional()
    .describe(
      'When true with a `docName` or `folder`, arm that target so a subsequent Claude-pane base-open (`preview_start`) lands there instead of the presence-driven default. TTL-bounded (~30s) so a stale arm cannot hijack a later open.',
    ),
  cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
} as const;

const OutputSchema = outputSchemaWithText({
  url: z
    .string()
    .nullable()
    .describe(
      'Browser-reachable URL — the UI base joined with the doc route when `docName` is given, else the UI root. `null` when no UI is running.',
    ),
  baseUrl: z
    .string()
    .nullable()
    .describe(
      'Browser-reachable origin of the running UI (e.g. `http://localhost:5173`). `null` when no UI is running.',
    ),
  running: z.boolean().describe('Whether a UI is running for the project.'),
  autoOpen: z
    .boolean()
    .describe(
      'User-scoped preview-auto-open preference (`appearance.preview.autoOpen`). When `true`, the agent should route the preview using capability-based routing (in-app browser if available, system browser as fallback). When `false`, the user is managing their own preview view (OK Desktop window, a browser tab they opened, etc.) — the agent must NOT open or refresh any preview UI, and should surface this URL only on direct user ask. Resolved fresh on every call; defaults to `true`.',
    ),
});

const NO_UI_MESSAGE =
  'No UI is running for this project. Start one to see the preview: `ok ui` (terminal), `preview_start("open-knowledge-ui")` (Claude Code), or open the project in OK Electron.';

export function register(server: ServerInstance, deps: GetPreviewUrlDeps): void {
  server.registerTool(
    'get_preview_url',
    {
      description: DESCRIPTION,
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
      },
    },
    async (args: { docName?: string; folder?: string; armPaneTarget?: boolean; cwd?: string }) => {
      if (args.docName && args.folder) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: 'Error: docName and folder are mutually exclusive — pass exactly one.',
            },
          ],
        };
      }
      const context = await resolveProjectConfigContext(deps.resolveCwd, deps.config, args.cwd);
      if (!context.ok) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error: ${context.error}` }],
        };
      }
      const lockDir = resolveLockDir(context.cwd);
      const ctx: PreviewUrlContext = { lockDir };
      const { baseUrl } = resolveUiInfo(ctx);
      const autoOpen = context.config.appearance.preview.autoOpen;

      const routeFragment = args.docName
        ? `#/${encodeDocName(args.docName)}`
        : args.folder
          ? `#/${encodeFolderRoute(args.folder)}`
          : null;

      if (args.armPaneTarget && routeFragment) {
        try {
          armPaneTarget(lockDir, routeFragment);
        } catch {
        }
      }

      const armNote =
        args.armPaneTarget && !routeFragment
          ? ' (note: armPaneTarget was set but no docName/folder was given, so nothing was armed)'
          : '';

      if (baseUrl === null) {
        return textPlusStructured(`${NO_UI_MESSAGE}${armNote}`, {
          url: null,
          baseUrl: null,
          running: false,
          autoOpen,
        });
      }

      const url = routeFragment ? `${baseUrl}/${routeFragment}` : baseUrl;

      return textPlusStructured(`Preview URL: ${url}${armNote}`, {
        url,
        baseUrl,
        running: true,
        autoOpen,
      });
    },
  );
}
