import { Page } from 'playwright';
import { DiscoveredAction } from './types';
import { config } from '../config';

/**
 * Breadth Discovery: Inspects the current page accessibility tree and uses
 * an LLM to discover and categorize available interactive actions.
 */
export async function discoverScreenActions(
  page: Page,
  maxBreadth: number = 8
): Promise<DiscoveredAction[]> {
  const currentUrl = page.url();
  const title = await page.title().catch(() => '');

  // 1. Capture accessible ARIA snapshot (Playwright standard)
  let ariaSnapshot = '';
  try {
    ariaSnapshot = await page
      .locator('main, [role="main"], #main-content, body')
      .first()
      .ariaSnapshot({ timeout: 4000 });
  } catch {
    ariaSnapshot = '';
  }

  // 2. Try LLM Discovery if API key is present
  const apiKey = config.geminiApiKey;
  if (apiKey && ariaSnapshot.length > 50) {
    try {
      const actions = await queryLLMForActions(apiKey, currentUrl, title, ariaSnapshot, maxBreadth);
      if (actions.length > 0) {
        return actions;
      }
    } catch (err: any) {
      console.warn(`[TreeExplorer] LLM Discovery error: ${err.message}. Falling back to semantic heuristics.`);
    }
  }

  // 3. Resilient Semantic Heuristic Fallback
  return fallbackHeuristicDiscovery(page, maxBreadth);
}

async function queryLLMForActions(
  apiKey: string,
  url: string,
  title: string,
  ariaSnapshot: string,
  maxBreadth: number
): Promise<DiscoveredAction[]> {
  const systemPrompt = `You are an Autonomous Web QA Architect.
Analyze the current page state and identify up to ${maxBreadth} high-value, distinct user interactions (state mutations, view limits, sorting, cart actions, or detail page navigation).

URL: ${url}
Title: "${title}"

Accessible Snapshot:
${ariaSnapshot.slice(0, 4500)}

Identify the most significant actions that transition state or test page invariants.
Categories:
- STATE_MUTATION (e.g. Add to Cart, Remove, Submit, Save, Delete)
- PAGINATION (e.g. View 10, View 25, View 50, Next)
- SORTING (e.g. Sort by price, rating)
- CONFIGURABLE_ITEM (e.g. Select Options, Customize)
- NAVIGATION (e.g. Click product card/title to view details)
- FILTER (e.g. Category, Price facet)
- FORM_INTERACTION (e.g. Input fields, textareas)

Rules:
- Generate resilient Playwright selectors (e.g. text="10", role=button[name="ADD TO CART"], role=combobox).
- Return STRICTLY a JSON array matching:
[
  {
    "id": string,
    "category": "STATE_MUTATION" | "PAGINATION" | "SORTING" | "CONFIGURABLE_ITEM" | "NAVIGATION" | "FILTER" | "FORM_INTERACTION",
    "locator": string,
    "actionType": "CLICK" | "SELECT" | "TYPE" | "CHECK",
    "value": string,
    "description": string,
    "expectedInvariant": string
  }
]`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: systemPrompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });

  const data: any = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return [];

  const parsed = JSON.parse(text) as DiscoveredAction[];
  return parsed.slice(0, maxBreadth);
}

/**
 * Heuristic fallback when LLM is unavailable
 */
async function fallbackHeuristicDiscovery(page: Page, maxBreadth: number): Promise<DiscoveredAction[]> {
  const actions: DiscoveredAction[] = [];
  const seen = new Set<string>();

  // 1. Check for per-page limit options (10, 25, 50)
  const perPageCandidates = page.locator('[class*="perpage" i] a, a:text-matches("^(\\d{2})$")');
  const perPageCount = await perPageCandidates.count().catch(() => 0);
  for (let i = 0; i < Math.min(perPageCount, 3); i++) {
    const text = (await perPageCandidates.nth(i).innerText().catch(() => '')).trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      actions.push({
        id: `perpage_${text}`,
        category: 'PAGINATION',
        locator: `text="${text}"`,
        actionType: 'CLICK',
        description: `Select View ${text} items per page`,
        expectedInvariant: `Rendered cards count must be <= ${text}`,
      });
    }
  }

  // 2. Check for Sort controls
  const sortSelect = page.locator('select[name*="sort" i], select[id*="sort" i], select').first();
  if (await sortSelect.isVisible().catch(() => false)) {
    actions.push({
      id: 'sort_option',
      category: 'SORTING',
      locator: 'select[name*="sort" i], select',
      actionType: 'SELECT',
      value: '1',
      description: 'Change sorting order option',
      expectedInvariant: 'Item ordering updates monotonically',
    });
  }

  // 3. Check for "ADD TO CART" buttons
  const addToCart = page.locator('a:has-text("ADD TO CART"), button:has-text("ADD TO CART")').first();
  if (await addToCart.isVisible().catch(() => false)) {
    actions.push({
      id: 'add_to_cart',
      category: 'STATE_MUTATION',
      locator: 'a:has-text("ADD TO CART"), button:has-text("ADD TO CART")',
      actionType: 'CLICK',
      description: 'Click "ADD TO CART" on item card',
      expectedInvariant: 'Cart item count increments or navigates to cart',
    });
  }

  // 4. Check for "SELECT OPTIONS" buttons
  const selectOptions = page.locator('a:has-text("SELECT OPTIONS"), button:has-text("SELECT OPTIONS")').first();
  if (await selectOptions.isVisible().catch(() => false)) {
    actions.push({
      id: 'select_options',
      category: 'CONFIGURABLE_ITEM',
      locator: 'a:has-text("SELECT OPTIONS"), button:has-text("SELECT OPTIONS")',
      actionType: 'CLICK',
      description: 'Click "SELECT OPTIONS" to open item details/options',
      expectedInvariant: 'Navigates to detail page with configurable choices',
    });
  }

  // 5. Check for Cart update / remove buttons (if already inside Cart state)
  const removeBtn = page.locator('a:has-text("Delete"), button:has-text("Remove"), [class*="delete" i], a:has-text("×")').first();
  if (await removeBtn.isVisible().catch(() => false)) {
    actions.push({
      id: 'remove_cart_item',
      category: 'STATE_MUTATION',
      locator: 'a:has-text("Delete"), button:has-text("Remove"), [class*="delete" i], a:has-text("×")',
      actionType: 'CLICK',
      description: 'Remove item from cart',
      expectedInvariant: 'Cart item count decreases',
    });
  }

  return actions.slice(0, maxBreadth);
}
