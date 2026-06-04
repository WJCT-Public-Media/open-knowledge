
import { z } from 'zod';
import { applyNestedFolderRulesUpsert } from '../../content/folder-rule-write.ts';
import {
  applyTemplateDelete,
  applyTemplateWrite,
  type TemplateFrontmatter,
} from '../../content/templates-write.ts';
import type { ConfigOrResolver, ServerInstance } from './shared.ts';
import {
  outputSchemaWithText,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectConfigContext,
  textPlusStructured,
} from './shared.ts';

export const DESCRIPTION = [
  '[Operates on disk; no running OK server required] Folder-level configuration writes. Dispatches on `action`:',
  '',
  "- `action: \"set-rule\"` — Upsert a folder's own frontmatter (open-shape, exactly like a doc's frontmatter — any key). Writes nested `<folder>/.ok/frontmatter.yml`. SELF-ONLY: this metadata describes the folder and does NOT cascade values into child docs — for per-doc starting values, write a template instead. Always batch-shape: pass `rules: [{...}]` even for one. Empty `frontmatter: {}` removes the rule and auto-cleans `<folder>/.ok/` if empty. Use `new_match` to rename the rule's match glob. Multi-folder globs are rejected (split per folder).",
  '- `action: "write-template"` — Create or update `<folder>/.ok/templates/<name>.md`. Templates are markdown starter shapes (the single mechanism for "what new docs start with"); agents instantiate via `write_document({ template })`. `title` in frontmatter is REQUIRED (menu surface). Body MAY use `{{date}}` / `{{user}}` substitution tokens; any other `{{...}}` is rejected. Unknown keys are rejected.',
  '- `action: "delete-template"` — Remove `<folder>/.ok/templates/<name>.md`. Idempotent (`existed: false` if missing). Auto-cleans empty `templates/` and `.ok/` dirs. Unknown keys are rejected.',
  '',
  'To apply several writes in one call (e.g. set a folder rule and write its template together), pass `operations: [{action, ...}, ...]` instead of a top-level `action`. Operations run in order; the response reports each.',
  '',
  '**Parameters:**',
  '- `action` — `set-rule` | `write-template` | `delete-template`. Omit when using `operations`.',
  '- `operations` — Array of `{action, ...}` objects. Mutually exclusive with a top-level `action`.',
  "- `rules` — Required for `set-rule`. Array of `{match, frontmatter, new_match?}`. `match` is a folder glob (`specs/**`). `frontmatter` is the folder's own open-shape metadata (any key, like a doc); `null` / `''` / `[]` clears a key.",
  '- `folder` — Required for `write-template`/`delete-template`. Project-root-relative folder. Empty / `.` means project root.',
  '- `name` — Required for `write-template`/`delete-template`. Filename without `.md` (letters/digits/`_`/`-` only).',
  '- `body` — Required for `write-template`. Markdown body. May use `{{date}}` / `{{user}}`.',
  '- `frontmatter` — Required for `write-template`. `{title (required), description?, tags?: string[]}`.',
  '- `cwd` (optional) — Project root.',
].join('\n');

interface FolderConfigDeps {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
}

const ACTIONS = ['set-rule', 'write-template', 'delete-template'] as const;

const FolderRuleUpsertInputSchema = z.object({
  match: z
    .string()
    .min(1)
    .describe(
      'Glob pattern (e.g. "specs/**", "meetings/prep-notes/**") that identifies the target folder.',
    ),
  frontmatter: z
    .record(z.string(), z.unknown())
    .refine(
      (obj) => {
        if ('title' in obj && obj.title !== null && typeof obj.title !== 'string') return false;
        if ('description' in obj && obj.description !== null && typeof obj.description !== 'string')
          return false;
        if ('tags' in obj && obj.tags !== null && !Array.isArray(obj.tags)) return false;
        return true;
      },
      {
        message:
          'Well-known keys must match expected types when present: `title` (string|null), `description` (string|null), `tags` (string[]|null).',
      },
    )
    .describe(
      "The folder's own open-shape frontmatter (any key, like a doc's). `title` / `description` / `tags` are conventional well-known keys the UI surfaces; other keys are allowed. Note one folder/doc asymmetry: only `title` / `description` / `tags` appear in `exec ls` output — other keys are stored and returned by `GET /api/folder-config` (and the folder-properties UI), but not surfaced on the directory listing. Self-only — does NOT cascade into child docs (use a template for per-doc starting values). `null` / `''` / `[]` clears a key; `{}` removes the rule.",
    ),
  new_match: z
    .string()
    .min(1)
    .optional()
    .describe('If set, move the rule from `match` to this new folder.'),
});

const TEMPLATE_NAME_REGEX = /^[A-Za-z0-9_-]+$/;

const TemplateFrontmatterSchema = z.object({
  title: z
    .string()
    .min(1, 'Template `title` is required — it is the menu surface agents pick from.')
    .describe('Required. The menu surface agents pick from.'),
  description: z
    .string()
    .optional()
    .describe('Recommended. Disambiguates similarly-named templates.'),
  tags: z
    .array(z.string())
    .optional()
    .describe('Optional. Applied to docs created from this template.'),
});

const ACTION_FIELDS = {
  rules: z
    .array(FolderRuleUpsertInputSchema)
    .min(1)
    .optional()
    .describe('Required for `set-rule`. Array of folder rules to upsert.'),
  folder: z
    .string()
    .optional()
    .describe(
      'Required for `write-template`/`delete-template`. Project-root-relative folder. Empty / `.` means project root.',
    ),
  name: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe(
      'Required for `write-template`/`delete-template`. Template filename without `.md` extension (letters/digits/`_`/`-` only — enforced per-action).',
    ),
  body: z.string().optional().describe('Required for `write-template`. Markdown body.'),
  frontmatter: TemplateFrontmatterSchema.optional().describe(
    'Required for `write-template`. Template menu metadata.',
  ),
} as const;

const OperationSchema = z
  .object({
    action: z.enum(ACTIONS).describe('Which folder-config write to perform.'),
    ...ACTION_FIELDS,
  })
  .strict();

type Operation = z.infer<typeof OperationSchema>;

function checkActionFields(
  op: {
    action?: string;
    rules?: unknown;
    folder?: unknown;
    name?: unknown;
    body?: unknown;
    frontmatter?: unknown;
  },
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  if (op.action === 'set-rule') {
    if (!op.rules) {
      ctx.addIssue({
        code: 'custom',
        message: 'action=set-rule requires `rules`.',
        path: [...path, 'rules'],
      });
    }
  } else if (op.action === 'write-template') {
    if (op.folder === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'action=write-template requires `folder`.',
        path: [...path, 'folder'],
      });
    }
    if (!op.name) {
      ctx.addIssue({
        code: 'custom',
        message: 'action=write-template requires `name`.',
        path: [...path, 'name'],
      });
    } else if (typeof op.name === 'string' && !TEMPLATE_NAME_REGEX.test(op.name)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Template name must use letters, digits, `_`, or `-` only (no slashes, dots, or spaces).',
        path: [...path, 'name'],
      });
    }
    if (op.body === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'action=write-template requires `body`.',
        path: [...path, 'body'],
      });
    }
    if (!op.frontmatter) {
      ctx.addIssue({
        code: 'custom',
        message: 'action=write-template requires `frontmatter`.',
        path: [...path, 'frontmatter'],
      });
    }
  } else if (op.action === 'delete-template') {
    if (op.folder === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'action=delete-template requires `folder`.',
        path: [...path, 'folder'],
      });
    }
    if (!op.name) {
      ctx.addIssue({
        code: 'custom',
        message: 'action=delete-template requires `name`.',
        path: [...path, 'name'],
      });
    } else if (typeof op.name === 'string' && !TEMPLATE_NAME_REGEX.test(op.name)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Template name must use letters, digits, `_`, or `-` only (no slashes, dots, or spaces).',
        path: [...path, 'name'],
      });
    }
  }
}

const FolderConfigInputSchema = z
  .object({
    action: z
      .enum(ACTIONS)
      .optional()
      .describe('Which folder-config write to perform. Omit when `operations` is set.'),
    ...ACTION_FIELDS,
    operations: z
      .array(OperationSchema)
      .min(1)
      .optional()
      .describe(
        'Batch form: apply several folder-config writes in one call. Mutually exclusive with `action`.',
      ),
    cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
  })
  .strict()
  .superRefine((args, ctx) => {
    if (args.operations !== undefined) {
      if (args.action !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: '`action` and `operations` are mutually exclusive.',
          path: ['action'],
        });
      }
      for (const field of ['rules', 'folder', 'name', 'body', 'frontmatter'] as const) {
        if (args[field] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            message: `\`${field}\` belongs inside an \`operations\` entry, not at the top level.`,
            path: [field],
          });
        }
      }
      args.operations.forEach((op, i) => {
        checkActionFields(op, ctx, ['operations', i]);
      });
      return;
    }
    if (args.action === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide either `action` or `operations`.',
        path: ['action'],
      });
      return;
    }
    checkActionFields(args, ctx, []);
  });

type FolderConfigArgs = z.infer<typeof FolderConfigInputSchema>;

const AppliedEntrySchema = z.object({
  match: z.string(),
  path: z.string(),
  action: z.enum(['written', 'deleted']),
});

const SingleResultSchema = z.union([
  z.object({ ok: z.literal(true), applied: z.array(AppliedEntrySchema) }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.enum(['MULTI_FOLDER_GLOB', 'PATH_ESCAPE', 'BAD_PROJECT_DIR', 'WRITE_ERROR']),
      message: z.string(),
      rule: z.string().optional(),
    }),
    partiallyApplied: z.array(AppliedEntrySchema).optional(),
  }),
  z.object({
    ok: z.literal(true),
    path: z.string(),
    created: z.boolean(),
    warnings: z.array(z.string()),
  }),
  z.object({
    ok: z.literal(true),
    path: z.string(),
    existed: z.boolean(),
    cleanedEmpty: z.object({
      templatesDir: z.boolean(),
      okDir: z.boolean(),
    }),
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: z.string(), message: z.string() }),
  }),
]);

const FolderConfigOutputSchema = outputSchemaWithText({
  result: z.union([
    SingleResultSchema,
    z.object({
      ok: z.boolean(),
      operations: z.array(z.object({ action: z.enum(ACTIONS), result: SingleResultSchema })),
    }),
  ]),
});

export function register(server: ServerInstance, deps: FolderConfigDeps): void {
  server.registerTool(
    'folder_config',
    {
      description: DESCRIPTION,
      inputSchema: FolderConfigInputSchema,
      outputSchema: FolderConfigOutputSchema,
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
        destructiveHint: true,
      },
    },
    async (args: FolderConfigArgs) => {
      const context = await resolveProjectConfigContext(deps.resolveCwd, deps.config, args.cwd);
      if (!context.ok) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error: ${context.error}` }],
        };
      }
      const { cwd } = context;

      if (args.operations !== undefined) {
        return handleBatch(args.operations, cwd);
      }

      switch (args.action) {
        case 'set-rule':
          return handleSetRule(args, cwd);
        case 'write-template':
          return handleWriteTemplate(args, cwd);
        case 'delete-template':
          return handleDeleteTemplate(args, cwd);
      }
      return {
        isError: true as const,
        content: [{ type: 'text' as const, text: 'Error: no action.' }],
      };
    },
  );
}

function applyOperation(op: Operation, cwd: string) {
  switch (op.action) {
    case 'set-rule': {
      if (!op.rules) {
        return {
          ok: false as const,
          error: { code: 'MISSING_FIELD', message: 'set-rule requires `rules`.' },
        };
      }
      return applyNestedFolderRulesUpsert({
        projectDir: cwd,
        rules: op.rules.map((r) => ({
          match: r.match,
          frontmatter: r.frontmatter ?? {},
          ...(r.new_match !== undefined ? { new_match: r.new_match } : {}),
        })),
      });
    }
    case 'write-template': {
      if (op.folder === undefined || !op.name || op.body === undefined || !op.frontmatter) {
        return {
          ok: false as const,
          error: {
            code: 'MISSING_FIELD',
            message: 'write-template requires `folder`, `name`, `body`, and `frontmatter`.',
          },
        };
      }
      return applyTemplateWrite({
        projectDir: cwd,
        folder: op.folder,
        name: op.name,
        body: op.body,
        frontmatter: op.frontmatter as TemplateFrontmatter,
      });
    }
    case 'delete-template': {
      if (op.folder === undefined || !op.name) {
        return {
          ok: false as const,
          error: {
            code: 'MISSING_FIELD',
            message: 'delete-template requires `folder` and `name`.',
          },
        };
      }
      return applyTemplateDelete({
        projectDir: cwd,
        folder: op.folder,
        name: op.name,
      });
    }
  }
}

function describeResult(action: string, result: ReturnType<typeof applyOperation>): string {
  if (!result.ok) return `${action}: ${result.error.code}: ${result.error.message}`;
  if ('applied' in result) return `${action}: ${result.applied.length} rule(s) applied`;
  if ('created' in result) {
    return `${action}: ${result.created ? 'created' : 'updated'} ${result.path}`;
  }
  if ('existed' in result) {
    return `${action}: ${result.existed ? 'deleted' : 'no-op (missing)'} ${result.path}`;
  }
  return action;
}

function handleBatch(operations: Operation[], cwd: string) {
  const results = operations.map((op) => ({ action: op.action, result: applyOperation(op, cwd) }));
  const allOk = results.every((r) => r.result.ok);
  const batchResult = { ok: allOk, operations: results };
  const text = results.map((r) => describeResult(r.action, r.result)).join('\n');
  if (!allOk) {
    return textPlusStructured(text, { result: batchResult }, true);
  }
  return textPlusStructured(text, { result: batchResult });
}

function handleSetRule(args: FolderConfigArgs, cwd: string) {
  const rules = args.rules ?? [];
  const result = applyNestedFolderRulesUpsert({
    projectDir: cwd,
    rules: rules.map((r) => ({
      match: r.match,
      frontmatter: r.frontmatter ?? {},
      ...(r.new_match !== undefined ? { new_match: r.new_match } : {}),
    })),
  });

  if (!result.ok) {
    return textPlusStructured(`${result.error.code}: ${result.error.message}`, { result }, true);
  }

  return textPlusStructured(JSON.stringify(result, null, 2), { result });
}

function handleWriteTemplate(args: FolderConfigArgs, cwd: string) {
  const result = applyTemplateWrite({
    projectDir: cwd,
    folder: args.folder ?? '',
    name: args.name ?? '',
    body: args.body ?? '',
    frontmatter: (args.frontmatter ?? { title: '' }) as TemplateFrontmatter,
  });

  if (!result.ok) {
    return textPlusStructured(`${result.error.code}: ${result.error.message}`, { result }, true);
  }

  const lines = [`${result.created ? 'Created' : 'Updated'} template at ${result.path}`];
  if (result.warnings.length > 0) {
    lines.push('', 'Warnings:');
    for (const w of result.warnings) lines.push(`  - ${w}`);
  }
  return textPlusStructured(lines.join('\n'), { result });
}

function handleDeleteTemplate(args: FolderConfigArgs, cwd: string) {
  const result = applyTemplateDelete({
    projectDir: cwd,
    folder: args.folder ?? '',
    name: args.name ?? '',
  });

  if (!result.ok) {
    return textPlusStructured(`${result.error.code}: ${result.error.message}`, { result }, true);
  }

  const lines = [
    result.existed
      ? `Deleted template at ${result.path}`
      : `Template at ${result.path} did not exist (no-op)`,
  ];
  if (result.cleanedEmpty.templatesDir) lines.push('Removed empty .ok/templates/ directory');
  if (result.cleanedEmpty.okDir) lines.push('Removed empty .ok/ directory');
  return textPlusStructured(lines.join('\n'), { result });
}
