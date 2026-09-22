import { Browser, BrowserContext, Page } from 'playwright';
import { DiscoveredAction } from './types';
import { computeStateFingerprint } from './fingerprint';

/**
 * Replays a sequence of actions in a fresh, isolated browser context.
 * Guarantees zero cookie or session pollution across alternative branches.
 */
export async function replayTrace(
  browser: Browser,
  startUrl: string,
  trace: DiscoveredAction[]
): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to root
  await page.goto(startUrl, { waitUntil: 'domcontentloaded' });

  // Replay actions cleanly with auto-waiting
  for (const step of trace) {
    const locator = page.locator(step.locator).first();
    await locator.waitFor({ state: 'visible', timeout: 5000 });

    if (step.actionType === 'CLICK') {
      await locator.click();
    } else if (step.actionType === 'SELECT') {
      await locator.selectOption(step.value || { index: 1 });
    } else if (step.actionType === 'CHECK') {
      await locator.check();
    } else if (step.actionType === 'TYPE') {
      await locator.fill(step.value || 'test');
    }

    // Explicit network / DOM settling (NO hardcoded sleeps)
    await page.waitForLoadState('domcontentloaded');
  }

  return { page, context };
}

/**
 * Executes a single depth step on the given page and evaluates the state transition.
 */
export async function executeDepthStep(
  page: Page,
  action: DiscoveredAction,
  previousFingerprint: string
): Promise<{ nextFingerprint: string; transitioned: boolean; error?: string }> {
  try {
    const locator = page.locator(action.locator).first();
    await locator.waitFor({ state: 'visible', timeout: 5000 });

    if (action.actionType === 'CLICK') {
      await locator.click();
    } else if (action.actionType === 'SELECT') {
      await locator.selectOption(action.value || { index: 1 });
    } else if (action.actionType === 'CHECK') {
      await locator.check();
    } else if (action.actionType === 'TYPE') {
      await locator.fill(action.value || 'test');
    }

    // Wait for DOM or navigation reaction
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});

    const nextFingerprint = await computeStateFingerprint(page);
    const transitioned = nextFingerprint !== previousFingerprint;

    return { nextFingerprint, transitioned };
  } catch (err: any) {
    return {
      nextFingerprint: previousFingerprint,
      transitioned: false,
      error: err.message,
    };
  }
}
