import { describe, expect, test } from 'bun:test';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { BUNDLE_SKILL_NAME } from '../../skill-bundles.ts';
import { HOCUSPOCUS_NOT_RUNNING_ERROR, type ServerInstance } from './shared.ts';
import { register as registerSkills, type SkillsToolDeps } from './skills.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: true;
}
type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

function captureSkills(serverUrl: string | undefined): Handler {
  let handler: Handler | undefined;
  const server = {
    registerTool(_name: string, _cfg: unknown, h: Handler) {
      handler = h;
    },
  } as unknown as ServerInstance;
  registerSkills(server, {
    serverUrl,
    config: BASE_CONFIG,
    resolveCwd: async () => process.cwd(),
  } as unknown as SkillsToolDeps);
  if (!handler) throw new Error('tool did not register');
  return handler;
}

const text = (r: ToolResult) => r.content.map((c) => c.text).join('\n');

describe('skills read tool — bundle-file gating short-circuits before the network', () => {
  const UNREACHABLE = 'http://127.0.0.1:1';

  test('`file` without `name` returns the teaching error', async () => {
    const handler = captureSkills(UNREACHABLE);
    const r = await handler({ file: 'references/x.md' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('pass `name` too');
  });

  test('`file` with an escaping path is rejected by the allowlist', async () => {
    const handler = captureSkills(UNREACHABLE);
    const r = await handler({ name: 'trip-log', file: 'references/../../etc/passwd' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('..');
  });

  test('`file` outside references/ or scripts/ is rejected', async () => {
    const handler = captureSkills(UNREACHABLE);
    const r = await handler({ name: 'trip-log', file: 'notes/x.md' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('references/');
  });
});

describe('skills read tool — server-required', () => {
  test('no server URL returns the not-running error', async () => {
    const handler = captureSkills(undefined);
    const r = await handler({ name: 'trip-log' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain(HOCUSPOCUS_NOT_RUNNING_ERROR);
  });
});

describe('skills read tool — built-in OK skills short-circuit before the network', () => {
  test('READ open-knowledge teaches instead of looking it up', async () => {
    const handler = captureSkills(undefined);
    const r = await handler({ name: 'open-knowledge', scope: 'project' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('built-in agent skills');
    expect(text(r)).toContain('already provided to you in your loaded skill list');
  });

  test('every shipped bundle name short-circuits (not just open-knowledge)', async () => {
    const handler = captureSkills(undefined);
    for (const name of Object.values(BUNDLE_SKILL_NAME)) {
      const r = await handler({ name });
      expect(r.isError, `isError for "${name}"`).toBe(true);
      expect(text(r), `teaching error for "${name}"`).toContain('NOT managed by this tool');
    }
  });

  test('READ-file on a built-in skill is short-circuited too', async () => {
    const handler = captureSkills(undefined);
    const r = await handler({ name: 'open-knowledge', file: 'references/x.md' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('built-in agent skills');
  });

  test('a user-authored pack skill is NOT treated as built-in', async () => {
    const handler = captureSkills(undefined);
    const r = await handler({ name: 'open-knowledge-pack-fishing' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain(HOCUSPOCUS_NOT_RUNNING_ERROR);
  });
});
