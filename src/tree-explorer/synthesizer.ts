import { DiscoveredAction } from './types';

/**
 * Synthesizes completed multi-step state-tree journeys into a standalone Playwright test spec.
 * Strictly adheres to Playwright best practices:
 * - Zero hardcoded sleeps (no page.waitForTimeout)
 * - Auto-waiting locators and web-first assertions
 */
export function synthesizePlaywrightSuite(targetUrl: string, journeys: DiscoveredAction[][]): string {
  const testCases = journeys.map((journey, journeyIdx) => {
    const journeyTitle = journey.map((step) => step.description).join(' ➔ ');

    const steps = journey
      .map((step, stepIdx) => {
        const varName = `step_${journeyIdx + 1}_${stepIdx + 1}`;
        const escapedLocator = step.locator.replace(/'/g, "\\'");

        let actionCode = '';
        if (step.actionType === 'CLICK') {
          actionCode = `await ${varName}.click();`;
        } else if (step.actionType === 'SELECT') {
          actionCode = `await ${varName}.selectOption('${step.value || '1'}');`;
        } else if (step.actionType === 'CHECK') {
          actionCode = `await ${varName}.check();`;
        } else if (step.actionType === 'TYPE') {
          actionCode = `await ${varName}.fill('${step.value || 'test'}');`;
        }

        return `
    // Step ${stepIdx + 1}: ${step.description}
    const ${varName} = page.locator('${escapedLocator}').first();
    await expect(${varName}).toBeVisible();
    ${actionCode}
    await page.waitForLoadState('domcontentloaded');
    // Invariant: ${step.expectedInvariant}`;
      })
      .join('\n');

    return `
  test('Journey ${journeyIdx + 1}: ${journeyTitle.replace(/'/g, "\\'")}', async ({ page }) => {
    await page.goto('${targetUrl}', { waitUntil: 'domcontentloaded' });
${steps}
  });`;
  }).join('\n');

  return `import { test, expect } from '@playwright/test';

test.describe('Autonomous State-Tree Test Suite (${targetUrl})', () => {
${testCases}
});
`;
}
