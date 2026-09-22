import { chromium } from 'playwright';
import { logger } from './utils/logger';
import { config } from './config';

/**
 * Lean Browser Driver for AI Agents (Under 45 lines).
 * Connects the AI directly to the browser with zero bloat.
 */
export async function launchPage(url?: string) {
  const targetUrl = url || config.targetUrl;
  const headless = config.headless;

  logger.info('BROWSER', `Launching browser session for ${targetUrl}`);
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  return { browser, context, page, targetUrl };
}

// CLI direct run
if (require.main === module) {
  (async () => {
    const { browser, page, targetUrl } = await launchPage();
    const title = await page.title();
    const aria = await page.locator('body').ariaSnapshot({ timeout: 2000 }).catch(() => '');

    logger.info('INSPECTOR', `Ready: "${title}"`, {
      url: targetUrl,
      interactiveSnapshotSnippet: aria.slice(0, 300),
    });

    await browser.close();
  })();
}
