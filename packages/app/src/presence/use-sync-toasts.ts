import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { useRelaunchInFlight } from '@/lib/relaunch-store';
import { restartCollabServer } from '@/lib/restart-collab-server';
import type { SyncStatus } from './use-sync-status';

const TOAST_ID = 'sync-status';

export async function runDisconnectRestart(
  bridge: Pick<OkDesktopBridge, 'restartServer' | 'config'>,
): Promise<void> {
  try {
    const result = await restartCollabServer(bridge);
    if (!result.ok) {
      toast.error(result.message, { id: TOAST_ID, duration: Infinity });
    }
  } catch {}
}

export function useSyncToasts(status: SyncStatus, activeDocName: string | null) {
  const { t } = useLingui();
  const relaunchInFlight = useRelaunchInFlight();
  const hasConnectedRef = useRef(false);
  const wasDisconnectedRef = useRef(false);

  const prevDocRef = useRef(activeDocName);

  useEffect(() => {
    if (prevDocRef.current !== activeDocName) {
      prevDocRef.current = activeDocName;
      hasConnectedRef.current = false;
      wasDisconnectedRef.current = false;
    }

    if (!activeDocName) return;

    if (status === 'synced') {
      hasConnectedRef.current = true;
    }

    if (status === 'disconnected' && hasConnectedRef.current) {
      if (relaunchInFlight) {
        toast.dismiss(TOAST_ID);
        return;
      }
      wasDisconnectedRef.current = true;
      const bridge = window.okDesktop;
      toast.warning(
        t`Connection lost \u2014 keep this tab open, your edits will sync when reconnected`,
        {
          id: TOAST_ID,
          duration: Infinity,
          ...(bridge
            ? {
                action: {
                  label: t`Restart server`,
                  onClick: () => {
                    void runDisconnectRestart(bridge);
                  },
                },
              }
            : {}),
        },
      );
    } else if (wasDisconnectedRef.current && status === 'synced') {
      wasDisconnectedRef.current = false;
      toast.success(t`Reconnected`, { id: TOAST_ID, duration: 3000 });
    }
  }, [status, activeDocName, t, relaunchInFlight]);
}
