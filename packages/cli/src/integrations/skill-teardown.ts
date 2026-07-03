import { join } from 'node:path';
import {
  BUNDLE_SKILL_NAME,
  type BundleId,
  USER_GLOBAL_BUNDLE_IDS,
} from '@inkeep/open-knowledge-server';
import { HOSTS_WITH_USER_SKILL_DIR } from '../commands/editors.ts';

export interface SkillBundleTarget {
  path: string;
  bundleId: BundleId;
  scope: 'central' | 'host';
  hostDir?: string;
}

export function userGlobalSkillBundleTargets(home: string): SkillBundleTarget[] {
  const targets: SkillBundleTarget[] = [];
  for (const bundleId of USER_GLOBAL_BUNDLE_IDS) {
    const name = BUNDLE_SKILL_NAME[bundleId];
    targets.push({
      path: join(home, '.agents', 'skills', name),
      bundleId,
      scope: 'central',
    });
    for (const host of HOSTS_WITH_USER_SKILL_DIR) {
      targets.push({
        path: join(home, host.hostDir, 'skills', name),
        bundleId,
        scope: 'host',
        hostDir: host.hostDir,
      });
    }
  }
  return targets;
}
