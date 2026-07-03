import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { BUNDLE_SKILL_NAME, USER_GLOBAL_BUNDLE_IDS } from '@inkeep/open-knowledge-server';
import { HOSTS_WITH_USER_SKILL_DIR } from '../commands/editors.ts';
import { userGlobalSkillBundleTargets } from './skill-teardown.ts';

const HOME = '/home/tester';

describe('userGlobalSkillBundleTargets', () => {
  test('targets the central store + every per-host dir for each user-global bundle', () => {
    const targets = userGlobalSkillBundleTargets(HOME);
    const expectedCount = USER_GLOBAL_BUNDLE_IDS.length * (1 + HOSTS_WITH_USER_SKILL_DIR.length);
    expect(targets.length).toBe(expectedCount);

    for (const bundleId of USER_GLOBAL_BUNDLE_IDS) {
      const name = BUNDLE_SKILL_NAME[bundleId];
      expect(targets).toContainEqual({
        path: join(HOME, '.agents', 'skills', name),
        bundleId,
        scope: 'central',
      });
      for (const host of HOSTS_WITH_USER_SKILL_DIR) {
        expect(targets).toContainEqual({
          path: join(HOME, host.hostDir, 'skills', name),
          bundleId,
          scope: 'host',
          hostDir: host.hostDir,
        });
      }
    }
  });

  test('includes both built-in bundles by name (discovery + write-skill)', () => {
    const paths = userGlobalSkillBundleTargets(HOME).map((t) => t.path);
    expect(paths.some((p) => p.endsWith('/open-knowledge-discovery'))).toBe(true);
    expect(paths.some((p) => p.endsWith('/open-knowledge-write-skill'))).toBe(true);
  });

  test('never targets the shared ~/.agents/skills root itself', () => {
    const paths = userGlobalSkillBundleTargets(HOME).map((t) => t.path);
    expect(paths).not.toContain(join(HOME, '.agents', 'skills'));
    for (const t of userGlobalSkillBundleTargets(HOME).filter((x) => x.scope === 'central')) {
      expect(t.path.startsWith(`${join(HOME, '.agents', 'skills')}/`)).toBe(true);
    }
  });
});
