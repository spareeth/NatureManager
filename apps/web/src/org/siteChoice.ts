import { useSyncExternalStore } from 'react';

// The chosen project (site) per organisation, kept in this browser and shared by every screen.
const KEY = (orgId: string) => `tg.currentSite:${orgId}`;
const listeners = new Set<() => void>();

export function getSiteChoice(orgId: string | undefined): string | null {
  if (!orgId) return null;
  try {
    return localStorage.getItem(KEY(orgId));
  } catch {
    return null;
  }
}

export function setSiteChoice(orgId: string, siteId: string) {
  try {
    localStorage.setItem(KEY(orgId), siteId);
  } catch {
    // storage unavailable: the choice lasts until the page reloads
  }
  memory.set(orgId, siteId);
  listeners.forEach((l) => l());
}

const memory = new Map<string, string>();

export function useSiteChoice(orgId: string | undefined): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (orgId ? (memory.get(orgId) ?? getSiteChoice(orgId)) : null),
  );
}

/** Projects announced but not set up yet (CLAUDE.md: Expo Valley comes after the pilot). */
export const UPCOMING_SITES = [{ code: 'EV', name: 'Expo Valley' }];

/** The site to show: the chosen one if it exists, else the first by code. */
export function pickSite<T extends { id: string }>(
  sites: T[] | undefined,
  chosen: string | null,
): T | undefined {
  return sites?.find((s) => s.id === chosen) ?? sites?.[0];
}
