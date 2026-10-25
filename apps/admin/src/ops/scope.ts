import { adminAuthApi, setApiErrorListener, setRequestHeadersProvider } from '@wholo/admin-api-client';
import type { AuthUser } from '@wholo/types';
import type { OpsScope } from '@/lib/ops-seam';
import { endSelection, getSelection, isAccessEnded, profileMatchesSelection, refreshSelection, selectionHeaders } from './selection';
import { endedCause, leaveWholesaler } from './navigation';
import { OPS_BUILD_MARKER } from './marker';

let installed = false;

export const opsScope: OpsScope = {
  install() {
    if (installed) return;
    installed = true;
    document.documentElement.dataset.build = OPS_BUILD_MARKER;
    setRequestHeadersProvider(selectionHeaders);
    setApiErrorListener((error) => {
      if (isAccessEnded(error) && getSelection()) {
        leaveWholesaler(endedCause());
      }
    });
  },

  /**
   * The user to run the app as. With a wholesaler selected in this tab, the
   * profile apps/api resolves for it — checked against the selection, so a
   * stale or tampered one is dropped rather than trusted. Otherwise the
   * operator's own Stocdup profile. If the access can't be checked (an
   * outage), it throws and keeps the selection: a blip is not an ending.
   */
  async resolveUser(home: AuthUser): Promise<AuthUser> {
    if (!getSelection()) return home;
    const check = await confirmSelection();
    if (check.status === 'CONFIRMED') return check.profile;
    if (check.status === 'UNKNOWN') throw new Error('Could not check support access');
    endSelection(endedCause());
    return home;
  },
};

export type SelectionCheck = { status: 'CONFIRMED'; profile: AuthUser } | { status: 'ENDED' } | { status: 'UNKNOWN' };

/**
 * Ask apps/api whether this tab's support access still holds. CONFIRMED
 * brings the stored end time up to date; ENDED means it was refused or
 * resolved to something else; UNKNOWN means it could not be checked.
 */
export async function confirmSelection(): Promise<SelectionCheck> {
  const selection = getSelection();
  if (!selection) return { status: 'ENDED' };
  try {
    const profile = await adminAuthApi.me();
    if (!profileMatchesSelection(profile, selection)) return { status: 'ENDED' };
    refreshSelection(profile);
    return { status: 'CONFIRMED', profile };
  } catch (error) {
    return isAccessEnded(error) ? { status: 'ENDED' } : { status: 'UNKNOWN' };
  }
}
