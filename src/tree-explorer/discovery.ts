import { Page } from 'playwright';
import { DiscoveredAction } from './types';
import { config } from '../config';

/**
 * Checks whether a URL, pathname, or title matches any excluded URL pattern.
 */
export function isUrlExcluded(urlOrText: string | undefined, patterns: string[]): boolean {
  if (!urlOrText || !patterns || patterns.length === 0) return false;
  const lower = urlOrText.toLowerCase().trim();
  const normalized = lower.replace(/[-_]/g, ' ');
  return patterns.some((pattern) => {
    const lowerPat = pattern.toLowerCase().trim();
    if (!lowerPat) return false;
    const normalizedPat = lowerPat.replace(/[-_]/g, ' ');
    return lower.includes(lowerPat) || normalized.includes(normalizedPat);
  });
}

/**
 * Breadth Discovery: Inspects the current page accessibility tree and uses
 * an LLM to discover and categorize available interactive actions.
 */
export async function discoverScreenActions(
  page: Page,
  maxBreadth: number = config.maxBreadthPerScreen,
  includeMenuHeaderFooter: boolean = config.includeMenuHeaderFooter,
  excludedUrlPatterns: string[] = config.excludedUrlPatterns
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
  return fallbackHeuristicDiscovery(page, maxBreadth, includeMenuHeaderFooter, excludedUrlPatterns);
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

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
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
 * Site-Agnostic Semantic Discovery:
 * Pure DOM topology and accessibility tree inspection.
 * - Detects repeated card containers (e.g. products, list items, search results) via DOM topology.
 * - Diversifies actions across cards so no two cards repeat the same action type.
 * - Discovers all page-level interactive controls (dropdowns, pagination, buttons, links, inputs).
 * - Generates resilient Playwright locators with zero site-specific selectors.
 */
async function fallbackHeuristicDiscovery(
  page: Page,
  maxBreadth: number,
  includeMenuHeaderFooter: boolean = false,
  excludedUrlPatterns: string[] = []
): Promise<DiscoveredAction[]> {
  interface RawOptionItem {
    value: string;
    text: string;
    selected: boolean;
  }

  interface RawElementItem {
    tag: string;
    type: string;
    role: string;
    id?: string;
    name?: string;
    accName: string;
    href?: string;
    options?: RawOptionItem[];
    cardIndex: number;
    cardTitle: string;
    cardTag: string;
  }

  const rawData = await page.evaluate<RawElementItem[]>(`(() => {
    const includeChrome = ${includeMenuHeaderFooter};
    const excludedPatterns = ${JSON.stringify(excludedUrlPatterns)};

    function isExcluded(urlOrText, patterns) {
      if (!urlOrText || !patterns || patterns.length === 0) return false;
      const lower = urlOrText.toLowerCase().trim();
      const normalized = lower.replace(/[-_]/g, ' ');
      return patterns.some((p) => {
        const lp = p.toLowerCase().trim();
        if (!lp) return false;
        const np = lp.replace(/[-_]/g, ' ');
        return lower.includes(lp) || normalized.includes(np);
      });
    }

    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
    }

    function getAccName(el) {
      if (el.tagName === 'SELECT') {
        const labelEl = el.labels && el.labels[0] ? el.labels[0].innerText : '';
        return (
          el.getAttribute('aria-label') ||
          labelEl ||
          el.getAttribute('title') ||
          el.getAttribute('name') ||
          'sort'
        ).trim().replace(/\\s+/g, ' ');
      }
      return (
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        (el instanceof HTMLInputElement ? (el.value || el.placeholder || '') : '') ||
        el.innerText ||
        ''
      ).trim().replace(/\\s+/g, ' ');
    }

    // 1. Detect repeated card containers purely via DOM topology
    const containerCandidates = Array.from(
      document.querySelectorAll('ul, ol, div, section, main, [role="list"], [role="grid"]')
    );
    let bestCards = [];

    for (const parent of containerCandidates) {
      const children = Array.from(parent.children).filter(isVisible);
      if (children.length >= 3 && children.length <= 150) {
        const firstTag = children[0].tagName;
        const sameTagCount = children.filter((c) => c.tagName === firstTag).length;
        if (sameTagCount / children.length >= 0.8) {
          const withInteractables = children.filter((c) =>
            c.querySelector('a, button, select, input, [role="button"], [role="link"]')
          );
          if (withInteractables.length >= 3 && withInteractables.length / children.length >= 0.7) {
            if (withInteractables.length > bestCards.length) {
              bestCards = withInteractables;
            }
          }
        }
      }
    }

    function findCardIndex(el) {
      for (let i = 0; i < bestCards.length; i++) {
        if (bestCards[i].contains(el)) return i;
      }
      return -1;
    }

    function findCardTitle(card) {
      const heading = card.querySelector(
        'h1, h2, h3, h4, h5, [class*="title" i], [class*="name" i], strong, b'
      );
      if (heading) {
        const text = heading.innerText ? heading.innerText.trim() : '';
        if (text && text.length > 1 && text.length < 80) return text;
      }
      const anchors = Array.from(card.querySelectorAll('a'));
      for (const a of anchors) {
        const text = a.innerText ? a.innerText.trim() : '';
        if (
          text &&
          text.length > 1 &&
          text.length < 80 &&
          !/^(add|buy|select|view|more|click|delete|remove|login)/i.test(text)
        ) {
          return text;
        }
      }
      return '';
    }

    // 2. Discover all visible interactive controls
    const interactables = Array.from(
      document.querySelectorAll(
        'a[href], button, select, input, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="combobox"]'
      )
    )
      .filter(isVisible)
      .filter((el) => !el.disabled);

    const items = [];

    for (const el of interactables) {
      const tag = el.tagName.toUpperCase();
      const type = (el.getAttribute('type') || '').toLowerCase();
      const role =
        el.getAttribute('role') ||
        (tag === 'A' ? 'link' : tag === 'BUTTON' ? 'button' : tag === 'SELECT' ? 'combobox' : 'generic');
      const accName = getAccName(el);
      const href = el.getAttribute('href') || undefined;

      // Ignore trivial empty / bookmark links
      if (tag === 'A' && !accName && (!href || href === '#' || href.startsWith('javascript:'))) {
        continue;
      }
      // Skip skip-links
      if (href && href.startsWith('#') && accName.toLowerCase().includes('skip')) {
        continue;
      }

      // Skip elements matching excluded URL patterns or titles
      if (isExcluded(href, excludedPatterns) || isExcluded(accName, excludedPatterns)) {
        continue;
      }

      const cardIdx = findCardIndex(el);

      // Exclude header, footer, and navigation menu when not requested
      if (!includeChrome && cardIdx === -1) {
        const inChrome = !!el.closest(
          'header, footer, nav, [role="banner"], [role="navigation"], [role="contentinfo"], .site-header, .site-footer, .main-menu, .main-navigation, [class*="header" i], [class*="footer" i], [class*="navbar" i]'
        );
        if (inChrome) continue;
      }

      const cardTitle = cardIdx >= 0 ? findCardTitle(bestCards[cardIdx]) : '';
      const cardTag = cardIdx >= 0 ? bestCards[cardIdx].tagName.toLowerCase() : '';

      let options = undefined;
      if (tag === 'SELECT') {
        const selectEl = el;
        options = Array.from(selectEl.options)
          .filter((opt) => !opt.disabled && opt.text && opt.text.trim())
          .map((opt) => ({
            value: opt.value || opt.text.trim(),
            text: opt.text.trim(),
            selected: opt.selected,
          }));
      }

      items.push({
        tag,
        type,
        role,
        id: el.id || undefined,
        name: el.getAttribute('name') || undefined,
        accName,
        href,
        options,
        cardIndex: cardIdx,
        cardTitle,
        cardTag,
      });
    }

    return items;
  })()`);

  const actions: DiscoveredAction[] = [];
  const seenActionKeys = new Set<string>();

  const pageItems = rawData.filter((i) => i.cardIndex === -1);
  const cardItems = rawData.filter((i) => i.cardIndex >= 0);

  // Group card items by card index
  const cardsMap = new Map<number, typeof rawData>();
  for (const item of cardItems) {
    if (!cardsMap.has(item.cardIndex)) {
      cardsMap.set(item.cardIndex, []);
    }
    cardsMap.get(item.cardIndex)!.push(item);
  }

  // --- A. Process Page-Level Controls ---
  for (const item of pageItems) {
    const normName = item.accName.toLowerCase();
    const actionKey = `${item.tag}:${item.type}:${normName || item.href}`;
    if (seenActionKeys.has(actionKey)) continue;
    seenActionKeys.add(actionKey);

    let category: DiscoveredAction['category'] = 'NAVIGATION';
    let actionType: DiscoveredAction['actionType'] = 'CLICK';
    let description = '';
    let expectedInvariant = '';
    let locator = '';

    if (item.tag === 'SELECT') {
      const selectLocator = item.id
        ? `select#${item.id}:visible`
        : item.name
        ? `select[name="${item.name}"]:visible`
        : 'select:visible';

      const optionItems =
        item.options && item.options.length > 0
          ? item.options
          : [{ value: '1', text: 'Option', selected: false }];

      for (const opt of optionItems) {
        const optVal = opt.value || opt.text;
        const optTitle = opt.text || opt.value;
        actions.push({
          id: `sort_${optVal}`.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          category: 'SORTING',
          locator: selectLocator,
          actionType: 'SELECT',
          value: optVal,
          description: `Sort by "${optTitle}"`,
          expectedInvariant: `Re-orders display items according to "${optTitle}"`,
        });
      }
      continue;
    } else if (item.type === 'checkbox' || item.type === 'radio') {
      category = 'FILTER';
      actionType = 'CHECK';
      description = `Toggle facet "${item.accName || 'filter'}"`;
      expectedInvariant = 'Filtered items count updates monotonically';
      locator = item.accName ? `role=checkbox[name="${item.accName}"]` : 'input[type="checkbox"]:visible';
    } else if (item.tag === 'INPUT' && (item.type === 'text' || item.type === 'search' || !item.type)) {
      category = 'FORM_INTERACTION';
      actionType = 'TYPE';
      description = `Input query into "${item.accName || 'search field'}"`;
      expectedInvariant = 'Search input updates query parameters';
      locator = item.accName
        ? `role=textbox[name="${item.accName}"]`
        : 'input[type="text"]:visible, input[type="search"]:visible';
    } else if (/^\d+$/.test(item.accName.trim())) {
      category = 'PAGINATION';
      actionType = 'CLICK';
      description = `Select page or per-page limit "${item.accName.trim()}"`;
      expectedInvariant = `Display adjusts to page limit or number ${item.accName.trim()}`;
      locator = `a:visible:has-text("${item.accName.trim()}"), button:visible:has-text("${item.accName.trim()}")`;
    } else if (/next|previous|prev|more/i.test(item.accName)) {
      category = 'PAGINATION';
      actionType = 'CLICK';
      description = `Navigate pagination: "${item.accName}"`;
      expectedInvariant = 'Displays next page of results';
      locator = `${item.tag.toLowerCase()}:visible:has-text("${item.accName}")`;
    } else if (item.tag === 'BUTTON' || item.role === 'button' || item.type === 'submit') {
      category = 'STATE_MUTATION';
      actionType = 'CLICK';
      description = `Click button "${item.accName || 'action'}"`;
      expectedInvariant = 'Triggers action state update';
      locator = item.accName
        ? `button:visible:has-text("${item.accName}"), [role="button"]:visible:has-text("${item.accName}")`
        : 'button:visible';
    } else {
      category = 'NAVIGATION';
      actionType = 'CLICK';
      description = `Navigate via link "${item.accName || item.href || 'link'}"`;
      expectedInvariant = 'Transitions to target destination';
      locator = item.accName
        ? `a:visible:has-text("${item.accName}")`
        : `a[href="${item.href}"]:visible`;
    }

    actions.push({
      id: `page_action_${actions.length + 1}`,
      category,
      locator,
      actionType,
      value: actionType === 'SELECT' ? '1' : undefined,
      description,
      expectedInvariant,
    });
  }

  // --- B. Process Card-Level Controls (Diversified across cards) ---
  // "if different products, don't do the same thing for each product..."
  const usedCardArchetypes = new Set<string>();

  for (const [cardIdx, itemsInCard] of cardsMap.entries()) {
    let selectedItem: (typeof itemsInCard)[0] | null = null;
    let chosenArchetype = '';

    for (const item of itemsInCard) {
      let archetype = 'SECONDARY_ACTION';
      const isButton = item.tag === 'BUTTON' || item.role === 'button' || item.type === 'submit';
      const isSelect = item.tag === 'SELECT' || item.type === 'checkbox' || item.type === 'radio';
      const isTitleLink =
        item.tag === 'A' &&
        item.cardTitle &&
        (item.accName.toLowerCase() === item.cardTitle.toLowerCase() ||
          item.cardTitle.toLowerCase().includes(item.accName.toLowerCase()) ||
          item.accName.toLowerCase().includes(item.cardTitle.toLowerCase()));

      if (isSelect) {
        archetype = 'OPTION_SELECT';
      } else if (
        isButton ||
        (!isTitleLink && item.accName.length > 0 && /^(add|buy|order|cart|checkout|get|subscribe|sign)/i.test(item.accName))
      ) {
        archetype = 'PRIMARY_ACTION';
      } else if (isTitleLink || (item.tag === 'A' && item.href)) {
        archetype = 'DETAIL_LINK';
      }

      if (!usedCardArchetypes.has(archetype)) {
        selectedItem = item;
        chosenArchetype = archetype;
        break;
      }
    }

    if (selectedItem && chosenArchetype) {
      usedCardArchetypes.add(chosenArchetype);

      const cardLabel = selectedItem.cardTitle || `item #${cardIdx + 1}`;
      let category: DiscoveredAction['category'] = 'NAVIGATION';
      let actionType: DiscoveredAction['actionType'] = 'CLICK';
      let description = '';
      let expectedInvariant = '';
      let locator = '';

      if (chosenArchetype === 'DETAIL_LINK') {
        category = 'NAVIGATION';
        actionType = 'CLICK';
        description = `View details for "${cardLabel}"`;
        expectedInvariant = 'Navigates to item detail view';
        locator = selectedItem.accName
          ? `a:visible:has-text("${selectedItem.accName}")`
          : `${selectedItem.cardTag || '*'}:has-text("${cardLabel}") a:visible`;
      } else if (chosenArchetype === 'PRIMARY_ACTION') {
        category = 'STATE_MUTATION';
        actionType = 'CLICK';
        description = `Perform "${selectedItem.accName || 'action'}" on "${cardLabel}"`;
        expectedInvariant = 'Item state mutates (e.g. added to transaction or state updated)';
        locator = selectedItem.cardTitle
          ? `${selectedItem.cardTag || '*'}:has-text("${cardLabel}") >> :visible:has-text("${selectedItem.accName}")`
          : `:visible:has-text("${selectedItem.accName}")`;
      } else if (chosenArchetype === 'OPTION_SELECT') {
        category = 'CONFIGURABLE_ITEM';
        actionType = selectedItem.tag === 'SELECT' ? 'SELECT' : 'CHECK';
        description = `Configure option on "${cardLabel}"`;
        expectedInvariant = 'Configurable option updates item state';
        locator = selectedItem.cardTitle
          ? `${selectedItem.cardTag || '*'}:has-text("${cardLabel}") >> ${selectedItem.tag.toLowerCase()}:visible`
          : `${selectedItem.tag.toLowerCase()}:visible`;
      } else {
        category = 'NAVIGATION';
        actionType = 'CLICK';
        description = `Trigger "${selectedItem.accName}" on "${cardLabel}"`;
        expectedInvariant = 'Transitions state for item';
        locator = selectedItem.cardTitle
          ? `${selectedItem.cardTag || '*'}:has-text("${cardLabel}") >> :visible:has-text("${selectedItem.accName}")`
          : `:visible:has-text("${selectedItem.accName}")`;
      }

      actions.push({
        id: `card_${cardIdx + 1}_${chosenArchetype.toLowerCase()}`,
        category,
        locator,
        actionType,
        value: actionType === 'SELECT' ? '1' : undefined,
        description,
        expectedInvariant,
      });
    }
  }

  return actions.slice(0, maxBreadth);
}
