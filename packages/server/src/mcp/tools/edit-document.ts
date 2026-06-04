
import { ContentDivergenceWarningSchema, renderInventoryFooter } from '@inkeep/open-knowledge-core';
import { z } from 'zod';
import { resolveLockDir } from '../../config/paths.ts';
import type { AgentIdentity } from '../agent-identity.ts';
import { buildPreviewAttachWarning, resolvePreviewUrl, START_UI_TEXT_HINT } from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpPost,
  normalizeDocName,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  summaryArgSchema,
  textPlusStructured,
  textResult,
} from './shared.ts';

const BASE_DESCRIPTION = [
  '[Requires: Hocuspocus server] Find-and-replace on a live document via the CRDT layer. The patch propagates to all connected editors in real-time. Use `offset` to target an exact occurrence; omit for first-match.',
  '',
  '**Body-only.** Frontmatter-intersecting find/replace is rejected with HTTP 400. For frontmatter: 1-2 keys → `edit_frontmatter`; full rewrite → `write_document({ position: "replace" })`.',
  '',
  '**Parameters:**',
  '- `docName` — Document name, extension-less. Trailing `.md`/`.mdx` stripped.',
  '- `find` — Text to find (exact match).',
  '- `replace` — Replacement text.',
  '- `offset` — Optional JavaScript string offset of the exact occurrence to patch. Stale offsets return an error; re-fetch via `links({ kind: "suggest", docName })`.',
  '- `summary` — Optional one-line user-outcome (≤80 chars). Avoid secrets or PII — persisted to git history.',
  '',
  'Responses may include `structuredContent.contentDivergence` (`{kind: "content-divergence", intendedBytes, actualBytes, byteDelta, divergenceType, currentState, hint}`) when the converged Y.Text doesn\'t match the bytes your splice composed to. The patch still landed; you do NOT need to re-read — `currentState` carries the converged document inline (or a truncation marker over the soft cap).',
].join('\n');

export const DESCRIPTION = `${BASE_DESCRIPTION}\n${renderInventoryFooter()}`;

interface EditDocumentDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
  identityRef?: { current: AgentIdentity };
}

export function register(server: ServerInstance, deps: EditDocumentDeps): void {
  server.registerTool(
    'edit_document',
    {
      description: DESCRIPTION,
      inputSchema: {
        docName: z.string().describe('Document name to edit'),
        find: z.string().describe('Text to find (exact match)'),
        replace: z.string().describe('Replacement text'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            'Exact occurrence to patch, as a JavaScript string offset in the current markdown',
          ),
        summary: summaryArgSchema,
        cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
      },
    },
    async (args: {
      docName: string;
      find: string;
      replace: string;
      offset?: number;
      summary?: string;
      cwd?: string;
    }) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, config, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const autoOpen = config.appearance.preview.autoOpen;
      const normalized = normalizeDocName(args.docName);
      if (!normalized.ok) return textResult(normalized.error, true);
      const identity = deps.identityRef?.current;
      const result = await httpPost(url, '/api/agent-patch', {
        docName: normalized.docName,
        find: args.find,
        replace: args.replace,
        offset: args.offset,
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
        const detail =
          typeof result.detail === 'string' && result.detail.length > 0 ? result.detail : '';
        return textResult(
          detail ? `Error: ${result.error} (${detail})` : `Error: ${result.error}`,
          true,
        );
      }

      const lockDir = resolveLockDir(cwd);
      const preview = resolvePreviewUrl(normalized.docName, { lockDir });
      const subscriberCount =
        typeof result.subscriberCount === 'number' ? result.subscriberCount : undefined;
      const systemSubscriberCount =
        typeof result.systemSubscriberCount === 'number' ? result.systemSubscriberCount : undefined;
      const noPreviewAnywhere = systemSubscriberCount === 0;
      const noPreviewOnThisDoc = subscriberCount === 0;

      const summaryResult =
        result.summary && typeof result.summary === 'object'
          ? (result.summary as { value: string; truncatedFrom?: number; hint?: string })
          : undefined;
      const summaryHint = typeof summaryResult?.hint === 'string' ? summaryResult.hint : undefined;

      const contentDivergenceParse = ContentDivergenceWarningSchema.safeParse(result.warning);
      const contentDivergence = contentDivergenceParse.success
        ? contentDivergenceParse.data
        : undefined;

      const lines: string[] = ['Edit applied successfully.'];
      if (noPreviewAnywhere && !preview) lines.push(START_UI_TEXT_HINT);
      if (summaryHint) lines.push(summaryHint);
      if (contentDivergence) {
        lines.push(
          `⚠ Content divergence: ${contentDivergence.actualBytes} actual bytes vs ${contentDivergence.intendedBytes} intended (byteDelta=${contentDivergence.byteDelta}). ${contentDivergence.hint ?? 'currentState carries the converged content (re-read only if it is truncated).'}`,
        );
      }
      const text = lines.join('\n');

      if (
        !preview &&
        !noPreviewAnywhere &&
        !noPreviewOnThisDoc &&
        !summaryResult &&
        !contentDivergence
      ) {
        return textResult(text);
      }

      const structured: Record<string, unknown> = {};
      if (preview) {
        structured.previewUrl = preview.url;
        structured.previewUrlSource = preview.source;
      }
      if (noPreviewAnywhere) {
        structured.warning = buildPreviewAttachWarning(preview, autoOpen);
      }
      if (summaryResult) {
        structured.summary = summaryResult;
      }
      if (contentDivergence) {
        structured.contentDivergence = contentDivergence;
      }
      return textPlusStructured(text, structured);
    },
  );
}
