import { describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { MCP_SERVER_NAME } from '@inkeep/open-knowledge-server';
import { readPathInstallMarker } from '../integrations/path-shim.ts';
import { buildManagedServerEntry } from './editors.ts';
import {
  buildUninstallPlan,
  deinitOps,
  type RunRemovalDeps,
  runRemoval,
  type UninstallPlanInput,
} from './removal-plan.ts';

const OWN_ENTRY = buildManagedServerEntry({ mode: 'published' });

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function stubDeps(over: Partial<RunRemovalDeps> = {}): RunRemovalDeps {
  return {
    clearToken: async () => ({ touched: ['keychain', 'file'] }),
    clearEmbeddingsKey: async () => ({ touched: ['file'] }),
    stopServer: () => ({ stopped: 0, failed: [] }),
    ...over,
  };
}

function seedHome(home: string): void {
  write(join(home, '.ok', 'auth.yml'), 'github.com: {}\n');
  write(join(home, '.ok', 'secrets.yml'), 'key: x\n');
  write(join(home, '.ok', 'logs', 'server.jsonl'), '{}\n');
  write(join(home, '.ok', 'skills', 'my-note-skill', 'SKILL.md'), '# mine\n');
  write(
    join(home, 'Library', 'Application Support', 'OpenKnowledge', 'state.json'),
    JSON.stringify({ recentProjects: [] }),
  );
  write(join(home, 'Library', 'Application Support', 'OpenKnowledge', 'path-install.json'), '{}');
  write(
    join(home, 'Library', 'Application Support', 'Open Knowledge', 'state.json'),
    JSON.stringify({ theirData: true }),
  );
  write(join(home, 'Library', 'Caches', 'OpenKnowledge-updater', 'pending.zip'), 'x');
  write(join(home, '.agents', 'skills', 'open-knowledge-discovery', 'SKILL.md'), '# d\n');
  write(join(home, '.claude', 'skills', 'open-knowledge-discovery', 'SKILL.md'), '# d\n');
  write(join(home, '.agents', 'skills', 'open-knowledge-write-skill', 'SKILL.md'), '# w\n');
  write(join(home, '.agents', 'skills', 'someone-elses-skill', 'SKILL.md'), '# theirs\n');
  write(
    join(home, '.claude.json'),
    `${JSON.stringify({ mcpServers: { other: { command: 'x' }, [MCP_SERVER_NAME]: OWN_ENTRY } }, null, 2)}\n`,
  );
  write(
    join(home, '.zshrc'),
    `export EDITOR=vim\n\n# >>> open-knowledge cli >>>\n[ -f "$HOME/.ok/env.sh" ] && . "$HOME/.ok/env.sh"\n# <<< open-knowledge cli <<<\n\nalias ll='ls -la'\n`,
  );
  write(
    join(home, '.config', 'fish', 'conf.d', 'open-knowledge.fish'),
    `# >>> open-knowledge cli >>>\nset -gx PATH "$HOME/.ok/bin" $PATH\n# <<< open-knowledge cli <<<\n`,
  );
}

function markerFor(home: string): UninstallPlanInput['marker'] {
  const extraTarget = join(home, '.ok', 'bin', 'ok');
  const extraLink = join(home, '.local', 'bin', 'ok');
  mkdirSync(dirname(extraTarget), { recursive: true });
  writeFileSync(extraTarget, 'wrapper');
  mkdirSync(dirname(extraLink), { recursive: true });
  rmSync(extraLink, { force: true });
  symlinkSync(extraTarget, extraLink);
  return {
    version: 1,
    installedAt: 'x',
    bundleVersion: '1.0.0',
    bundleWrapperPath: '/w',
    binDir: join(home, '.ok', 'bin'),
    envShimPath: join(home, '.ok', 'env.sh'),
    rcFiles: [join(home, '.zshrc'), join(home, '.config', 'fish', 'conf.d', 'open-knowledge.fish')],
    rcOptOuts: [],
    pathDiscovery: null,
    extraSymlinks: [{ path: extraLink, target: extraTarget, createdAt: 'x', kind: 'created' }],
  };
}

function baseInput(home: string, over: Partial<UninstallPlanInput> = {}): UninstallPlanInput {
  return {
    home,
    platform: 'darwin',
    host: 'github.com',
    lockDirs: [],
    marker: markerFor(home),
    recentDeinitProjectRoots: [],
    purgeContent: false,
    ...over,
  };
}

describe('buildUninstallPlan ordering', () => {
  test('stops servers first and removes ~/.ok last, with recent-project deinits before it', () => {
    const home = mkdtempSync(join(tmpdir(), 'ok-uninst-'));
    try {
      const plan = buildUninstallPlan(
        baseInput(home, {
          lockDirs: ['/some/project/.ok/local'],
          recentDeinitProjectRoots: ['/recent/proj'],
        }),
      );
      const kinds = plan.ops.map((o) => o.kind);
      expect(kinds[0]).toBe('stop-server'); // servers first
      const last = plan.ops[plan.ops.length - 1];
      expect(last.kind).toBe('remove-path');
      expect((last as { path: string }).path).toBe(join(home, '.ok'));
      const recentIdx = plan.ops.findIndex((o) => o.group === 'Project: proj');
      expect(recentIdx).toBeGreaterThan(-1);
      expect(recentIdx).toBeLessThan(plan.ops.length - 1);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('on non-macOS the desktop-only surfaces (app data + PATH shim) are absent', () => {
    const home = mkdtempSync(join(tmpdir(), 'ok-uninst-'));
    try {
      const plan = buildUninstallPlan({
        home,
        platform: 'linux',
        env: { XDG_CONFIG_HOME: join(home, '.config') },
        host: 'github.com',
        lockDirs: [],
        marker: null, // no PATH shim on non-mac
        recentDeinitProjectRoots: [],
        purgeContent: false,
      });
      expect(plan.ops.some((o) => o.group === 'Application data')).toBe(false);
      expect(plan.ops.some((o) => o.kind === 'shell-block')).toBe(false);
      expect(plan.ops.some((o) => o.kind === 'keychain-token')).toBe(true);
      expect(plan.ops.some((o) => o.group === 'Editor MCP configs')).toBe(true);
      expect(plan.ops.some((o) => o.group === 'Skill bundles')).toBe(true);
      expect(plan.ops[plan.ops.length - 1].kind).toBe('remove-path'); // ~/.ok last
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('strips the ~/.zshrc block even when the path-install manifest is ABSENT', async () => {
    const home = mkdtempSync(join(tmpdir(), 'ok-uninst-'));
    try {
      const zshrc = join(home, '.zshrc');
      writeFileSync(
        zshrc,
        `export EDITOR=vim\n\n# >>> open-knowledge cli >>>\n[ -f "$HOME/.ok/env.sh" ] && . "$HOME/.ok/env.sh"\n# <<< open-knowledge cli <<<\n\nalias ll='ls -la'\n`,
      );
      const plan = buildUninstallPlan(baseInput(home, { marker: null }));
      const shellOps = plan.ops.filter((o) => o.kind === 'shell-block');
      expect(shellOps.map((o) => (o as { rcFile: string }).rcFile)).toContain(zshrc);

      await runRemoval(plan, stubDeps());
      const after = readFileSync(zshrc, 'utf-8');
      expect(after).not.toContain('open-knowledge cli');
      expect(after).toContain('export EDITOR=vim');
      expect(after).toContain("alias ll='ls -la'");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('runRemoval — git-exclude write failure', () => {
  const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  test.skipIf(asRoot)('a read-only .git/info/exclude surfaces as a failed op', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'ok-gitx-'));
    try {
      const excludePath = join(projectRoot, '.git', 'info', 'exclude');
      mkdirSync(dirname(excludePath), { recursive: true });
      writeFileSync(excludePath, '.ok/\n'); // an OK path is excluded → removal is attempted
      chmodSync(excludePath, 0o444); // read-only → the write-back fails (EACCES)

      const op = {
        kind: 'git-exclude' as const,
        group: 'test',
        label: 'Remove OK paths from .git/info/exclude',
        projectRoot,
      };
      const outcome = await runRemoval({ scope: 'deinit', ops: [op] }, stubDeps());
      expect(outcome.failed).toHaveLength(1);
      expect(outcome.failed[0].detail).toContain('inaccessible');
    } finally {
      try {
        chmodSync(join(projectRoot, '.git', 'info', 'exclude'), 0o644);
      } catch {}
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

describe('runRemoval — project path containment guard', () => {
  test('refuses to remove a project artifact that escapes via a symlink', async () => {
    const home = mkdtempSync(join(tmpdir(), 'ok-contain-'));
    try {
      const projectRoot = join(home, 'proj');
      const outside = join(home, 'outside-secret');
      mkdirSync(outside, { recursive: true });
      writeFileSync(join(outside, 'keep.txt'), 'do not delete');
      mkdirSync(projectRoot, { recursive: true });
      symlinkSync(outside, join(projectRoot, '.claude'));

      const escaping = {
        kind: 'remove-path' as const,
        group: 'test',
        label: 'Remove .claude/skills/open-knowledge/',
        path: join(projectRoot, '.claude', 'skills', 'open-knowledge'),
        containWithin: projectRoot,
      };
      const outcome = await runRemoval({ scope: 'deinit', ops: [escaping] }, stubDeps());
      expect(outcome.failed).toHaveLength(1);
      expect(existsSync(join(outside, 'keep.txt'))).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('runRemoval — uninstall end to end', () => {
  test('reverses the whole footprint, preserving user content + foreign files', async () => {
    const home = mkdtempSync(join(tmpdir(), 'ok-uninst-'));
    try {
      seedHome(home);
      const plan = buildUninstallPlan(baseInput(home));
      const outcome = await runRemoval(plan, stubDeps());
      expect(outcome.failed).toHaveLength(0);

      expect(existsSync(join(home, '.ok', 'auth.yml'))).toBe(false);
      expect(existsSync(join(home, '.ok', 'logs'))).toBe(false);
      expect(existsSync(join(home, '.ok', 'skills', 'my-note-skill', 'SKILL.md'))).toBe(true);

      expect(existsSync(join(home, 'Library', 'Application Support', 'OpenKnowledge'))).toBe(false);
      expect(existsSync(join(home, 'Library', 'Application Support', 'Open Knowledge'))).toBe(true);
      expect(existsSync(join(home, 'Library', 'Caches', 'OpenKnowledge-updater'))).toBe(false);

      expect(existsSync(join(home, '.agents', 'skills', 'open-knowledge-discovery'))).toBe(false);
      expect(existsSync(join(home, '.claude', 'skills', 'open-knowledge-discovery'))).toBe(false);
      expect(existsSync(join(home, '.agents', 'skills', 'open-knowledge-write-skill'))).toBe(false);
      expect(existsSync(join(home, '.agents', 'skills', 'someone-elses-skill'))).toBe(true);

      const claudeCfg = JSON.parse(readFileSync(join(home, '.claude.json'), 'utf-8'));
      expect(claudeCfg.mcpServers[MCP_SERVER_NAME]).toBeUndefined();
      expect(claudeCfg.mcpServers.other).toEqual({ command: 'x' });

      const zshrc = readFileSync(join(home, '.zshrc'), 'utf-8');
      expect(zshrc).toContain('export EDITOR=vim');
      expect(zshrc).toContain("alias ll='ls -la'");
      expect(zshrc).not.toContain('open-knowledge cli');
      expect(existsSync(join(home, '.config', 'fish', 'conf.d', 'open-knowledge.fish'))).toBe(
        false,
      );

      expect(existsSync(join(home, '.local', 'bin', 'ok'))).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('--purge-content also removes user-authored ~/.ok/skills', async () => {
    const home = mkdtempSync(join(tmpdir(), 'ok-uninst-'));
    try {
      seedHome(home);
      const plan = buildUninstallPlan(baseInput(home, { purgeContent: true }));
      await runRemoval(plan, stubDeps());
      expect(existsSync(join(home, '.ok'))).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('a locked keychain is marked failed with a manual hint, never aborting the run', async () => {
    const home = mkdtempSync(join(tmpdir(), 'ok-uninst-'));
    try {
      seedHome(home);
      const plan = buildUninstallPlan(baseInput(home));
      const outcome = await runRemoval(
        plan,
        stubDeps({
          clearToken: async () => ({ touched: [], keychainError: 'SecKeychainError' }),
        }),
      );
      const keychain = outcome.results.find((r) => r.op.kind === 'keychain-token');
      expect(keychain?.status).toBe('failed');
      expect(keychain?.detail).toContain('Keychain Access');
      expect(existsSync(join(home, '.ok', 'auth.yml'))).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('a stop-server failure surfaces as failed (a live process may still hold the files)', async () => {
    const home = mkdtempSync(join(tmpdir(), 'ok-uninst-'));
    try {
      seedHome(home);
      const plan = buildUninstallPlan(baseInput(home, { lockDirs: ['/proj/.ok/local'] }));
      const outcome = await runRemoval(
        plan,
        stubDeps({
          stopServer: () => ({ stopped: 0, failed: [{ pid: 4242, error: 'EPERM' }] }),
        }),
      );
      const stop = outcome.results.find((r) => r.op.kind === 'stop-server');
      expect(stop?.status).toBe('failed');
      expect(stop?.detail).toContain('4242');
      expect(outcome.failed.some((r) => r.op.kind === 'stop-server')).toBe(true);
      expect(existsSync(join(home, '.ok', 'auth.yml'))).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('idempotent — a second run is a clean no-op (nothing removed, nothing failed)', async () => {
    const home = mkdtempSync(join(tmpdir(), 'ok-uninst-'));
    try {
      seedHome(home);
      const input = baseInput(home); // fabricates the marker + extra symlink
      await runRemoval(buildUninstallPlan(input), stubDeps());
      const secondInput: UninstallPlanInput = { ...input, marker: readPathInstallMarker(home) };
      const second = await runRemoval(
        buildUninstallPlan(secondInput),
        stubDeps({
          clearToken: async () => ({ touched: [] }),
          clearEmbeddingsKey: async () => ({ touched: [] }),
        }),
      );
      expect(second.failed).toHaveLength(0);
      expect(second.removed).toHaveLength(0);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('deinitOps', () => {
  test('emits stop + surgical MCP + launch + git-exclude + whole-remove + shadow ops', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'ok-deinit-'));
    try {
      const ops = deinitOps(projectRoot, '/home/x');
      const kinds = ops.map((o) => o.kind);
      expect(kinds[0]).toBe('stop-server');
      expect(kinds).toContain('mcp-entry'); // project MCP configs
      expect(kinds).toContain('launch-entry');
      expect(kinds).toContain('git-exclude');
      const okRemoval = ops.find(
        (o) =>
          o.kind === 'remove-path' && (o as { path: string }).path === join(projectRoot, '.ok'),
      );
      expect(okRemoval).toBeDefined();
      const mcpWholeRemove = ops.find(
        (o) =>
          o.kind === 'remove-path' &&
          (o as { path: string }).path === join(projectRoot, '.mcp.json'),
      );
      expect(mcpWholeRemove).toBeUndefined();
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
