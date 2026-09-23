import { Page } from 'playwright';
import timingConfig from '../config/timing.json';

/**
 * Single source of truth for browser-operation time bounds and intentional
 * observation windows. Values are maintained in config/timing.json.
 */
export const timing = Object.freeze(timingConfig);

/** Prefer this bounded event-based settle over a fixed sleep after actions. */
export async function settlePage(page: Page, timeoutMs = timing.networkIdleMs): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
}

/**
 * Some invariants intentionally measure whether state remains broken for a
 * specified interval. All fixed observation waits are isolated here.
 */
export async function observeFor(page: Page, durationMs: number): Promise<void> {
  await page.waitForTimeout(durationMs);
}
