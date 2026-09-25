import { Page } from 'playwright';
import { DiscoveredAction } from './types';
import { config } from '../config';
import { timing } from '../timing';
import { geminiEndpoint, geminiHeaders, geminiProviderConfig } from '../llm-provider-config';

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
      .ariaSnapshot({ timeout: timing.evidenceMs });
  } catch {
    ariaSnapshot = '';
  }

  // 2. Try LLM Discovery if enabled and API key is present
  const apiKey = config.geminiApiKey;
  if (config.llmDiscoveryEnabled && apiKey && ariaSnapshot.length > 50) {
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

  const endpoint = geminiEndpoint(geminiProviderConfig.discoveryModel);
  const res = await fetch(endpoint, {
    method: 'POST',
    signal: AbortSignal.timeout(timing.providerRequestMs),
    headers: geminiHeaders(apiKey),
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
    isCardTitleLink: boolean;
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
      const img = el.querySelector ? el.querySelector('img') : null;
      const imgAlt = img ? img.getAttribute('alt') || '' : '';
      return (
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        (el instanceof HTMLInputElement ? (el.value || el.placeholder || '') : '') ||
        el.innerText ||
        imgAlt ||
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

    // Measure text frequency across all candidate cards to mathematically separate
    // unique entity titles (frequency === 1) from repeated action controls (frequency >= 2)
    const textFrequency = new Map();
    for (const card of bestCards) {
      const textsInThisCard = new Set();
      const allTextEls = Array.from(
        card.querySelectorAll('h1, h2, h3, h4, h5, h6, a, button, [role="button"], [role="link"], span, strong, b')
      );
      for (const el of allTextEls) {
        const txt = (el.innerText || '').trim();
        if (txt && txt.length > 1 && txt.length < 80 && !textsInThisCard.has(txt)) {
          textsInThisCard.add(txt);
          textFrequency.set(txt, (textFrequency.get(txt) || 0) + 1);
        }
      }
    }

    function findCardTitle(card) {
      // 1. Semantic heading: h1 through h6 or role="heading"
      const headings = Array.from(
        card.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"], [class*="title" i], [class*="name" i]')
      );
      for (const h of headings) {
        const text = (h.innerText || '').trim();
        if (text && text.length > 1 && text.length < 80) {
          // If heading text is unique or near-unique across cards, it is definitely the title
          if ((textFrequency.get(text) || 0) <= 2) {
            return text;
          }
        }
      }

      // 2. Anchors whose text is unique across cards (frequency === 1)
      const anchors = Array.from(card.querySelectorAll('a'));
      for (const a of anchors) {
        const text = (a.innerText || '').trim();
        if (text && text.length > 1 && text.length < 80) {
          if ((textFrequency.get(text) || 0) <= 1) {
            return text;
          }
        }
      }

      // 3. Fallback: longest anchor text in the card
      let longest = '';
      for (const a of anchors) {
        const text = (a.innerText || '').trim();
        if (text && text.length > longest.length && text.length < 80 && (textFrequency.get(text) || 0) < bestCards.length) {
          longest = text;
        }
      }
      return longest;
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

      const isCardTitleLink =
        cardIdx >= 0 &&
        tag === 'A' &&
        cardTitle &&
        (accName.toLowerCase() === cardTitle.toLowerCase() ||
          cardTitle.toLowerCase().includes(accName.toLowerCase()) ||
          accName.toLowerCase().includes(cardTitle.toLowerCase()) ||
          !!el.closest('h1, h2, h3, h4, h5, h6, [role="heading"]'));

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
        isCardTitleLink: !!isCardTitleLink,
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
        ? `button:visible:has-text("${item.accName}"), [role="button"]:visible:has-text("${item.accName}"), input[type="submit"][value="${item.accName}"]:visible, input[type="button"][value="${item.accName}"]:visible, input[value="${item.accName}"]:visible`
        : 'button:visible, input[type="submit"]:visible, input[type="button"]:visible';
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
      description,
      expectedInvariant,
    });
  }

  // --- B. Process Card-Level Controls (Dynamic Topology & Action Signature Clustering) ---
  // Zero site-specific or language-specific regexes. Purely driven by DOM topology and element labels.

  interface CardRecord {
    cardIdx: number;
    cardTitle: string;
    cardTag: string;
    titleLink?: (typeof cardItems)[0];
    actionControls: typeof cardItems;
    primaryActionLabel: string;
  }

  const cardRecords: CardRecord[] = [];

  for (const [cardIdx, itemsInCard] of cardsMap.entries()) {
    const cardTitle = itemsInCard[0]?.cardTitle || '';
    const cardTag = itemsInCard[0]?.cardTag || '*';

    // Helper: identify elements that link to the entity/detail page rather than being action controls
    const isEntityOrDetailLink = (item: (typeof itemsInCard)[0]) => {
      if (item.tag !== 'A' && item.role !== 'link') return false;
      if (item.isCardTitleLink) return true;
      const normAcc = (item.accName || '').toLowerCase().trim();
      const normTitle = cardTitle.toLowerCase().trim();
      // Empty anchor (e.g. image cover link wrapper) is a navigation wrapper, not an action control
      if (!normAcc) return true;
      // If accessible text matches or is part of the card title, it represents the entity itself
      if (normTitle) {
        if (normAcc === normTitle) return true;
        if (normAcc.length >= 3 && (normTitle.includes(normAcc) || normAcc.includes(normTitle))) return true;
      }
      return false;
    };

    // Find the primary title link (prefer anchor explicitly matching cardTitle over image link)
    let titleLink =
      itemsInCard.find(
        (item) =>
          item.tag === 'A' &&
          cardTitle &&
          item.accName.toLowerCase().trim() === cardTitle.toLowerCase().trim()
      ) ||
      itemsInCard.find((item) => item.isCardTitleLink) ||
      itemsInCard.find(isEntityOrDetailLink) ||
      itemsInCard.find((item) => item.tag === 'A' && item.href);

    // Action controls: all interactables that are NOT entity/detail links
    const actionControls = itemsInCard.filter((item) => !isEntityOrDetailLink(item));

    // Primary action label: text of the first action control, or 'DETAIL_ONLY'
    const primaryActionLabel = actionControls[0]?.accName?.trim() || 'DETAIL_ONLY';

    cardRecords.push({
      cardIdx,
      cardTitle,
      cardTag,
      titleLink,
      actionControls,
      primaryActionLabel,
    });
  }

  // Group cards into families by their primary action signature
  const families = new Map<string, CardRecord[]>();
  for (const card of cardRecords) {
    if (!families.has(card.primaryActionLabel)) {
      families.set(card.primaryActionLabel, []);
    }
    families.get(card.primaryActionLabel)!.push(card);
  }

  // Identify majority family (standard/default product type on the page)
  let majorityFamilyLabel = '';
  let maxCount = 0;
  for (const [label, cards] of families.entries()) {
    if (cards.length > maxCount) {
      maxCount = cards.length;
      majorityFamilyLabel = label;
    }
  }

  // Diversified Action Allocation:
  // "if different products, don't do the same thing for each product..."
  for (const [actionLabel, cardsInFamily] of families.entries()) {
    const isMajority = actionLabel === majorityFamilyLabel;

    // --- Action A: Detail Navigation for this card family ---
    // Tested on Card 0 of this family
    const detailCard = cardsInFamily[0];
    if (detailCard && detailCard.titleLink) {
      const cardLabel = detailCard.cardTitle || `item #${detailCard.cardIdx + 1}`;
      const safeCardTitle = detailCard.cardTitle ? detailCard.cardTitle.replace(/"/g, '\\"') : '';
      const locator = safeCardTitle
        ? `a:visible:has-text("${safeCardTitle}")`
        : `${detailCard.cardTag}:nth-child(${detailCard.cardIdx + 1}) a:visible`;

      // Differentiate specialized card families (e.g. items with "SELECT OPTIONS")
      const description =
        isMajority || actionLabel === 'DETAIL_ONLY'
          ? `View details for "${cardLabel}"`
          : `View details for item with "${actionLabel}" ("${cardLabel}")`;

      actions.push({
        id: `card_${detailCard.cardIdx + 1}_view_details`,
        category: 'NAVIGATION',
        locator,
        actionType: 'CLICK',
        description,
        expectedInvariant: `Navigates to detail view for "${cardLabel}"`,
      });
    }

    // --- Action B: Primary Action Control for this card family ---
    // If multiple cards exist in the family, test action on Card 1 (a different product!).
    // If only 1 card exists, test on Card 0 so coverage is not lost.
    if (actionLabel !== 'DETAIL_ONLY') {
      const actionCard = cardsInFamily.length > 1 ? cardsInFamily[1] : cardsInFamily[0];
      const cardLabel = actionCard.cardTitle || `item #${actionCard.cardIdx + 1}`;
      const safeCardTitle = actionCard.cardTitle ? actionCard.cardTitle.replace(/"/g, '\\"') : '';
      const safeActionLabel = actionLabel.replace(/"/g, '\\"');
      const actionItem = actionCard.actionControls[0];

      let category: DiscoveredAction['category'] = 'STATE_MUTATION';
      let actionType: DiscoveredAction['actionType'] = 'CLICK';

      if (actionItem?.tag === 'SELECT') {
        category = 'CONFIGURABLE_ITEM';
        actionType = 'SELECT';
      } else if (actionItem?.type === 'checkbox' || actionItem?.type === 'radio') {
        category = 'CONFIGURABLE_ITEM';
        actionType = 'CHECK';
      }

      const locator = safeCardTitle
        ? `${actionCard.cardTag}:has-text("${safeCardTitle}") >> :visible:has-text("${safeActionLabel}")`
        : `:visible:has-text("${safeActionLabel}")`;

      actions.push({
        id: `card_${actionCard.cardIdx + 1}_action`,
        category,
        locator,
        actionType,
        value: actionType === 'SELECT' ? '1' : undefined,
        description: `Perform "${actionLabel}" on "${cardLabel}"`,
        expectedInvariant: `Triggers "${actionLabel}" on "${cardLabel}"`,
      });
    }

    // --- Action C: Additional Distinct Action Controls ---
    // If cards in this family have secondary distinct controls (e.g. swatches, favorite button),
    // allocate each distinct control to subsequent cards in the family without repeating
    const testedActionLabels = new Set<string>([actionLabel]);
    let nextCardIdx = 2;

    for (const card of cardsInFamily) {
      for (const ctrl of card.actionControls) {
        const ctrlLabel = ctrl.accName?.trim();
        if (ctrlLabel && !testedActionLabels.has(ctrlLabel) && nextCardIdx < cardsInFamily.length) {
          testedActionLabels.add(ctrlLabel);
          const targetCard = cardsInFamily[nextCardIdx++];
          const cardLabel = targetCard.cardTitle || `item #${targetCard.cardIdx + 1}`;
          const safeCardTitle = targetCard.cardTitle ? targetCard.cardTitle.replace(/"/g, '\\"') : '';
          const safeCtrlLabel = ctrlLabel.replace(/"/g, '\\"');

          let category: DiscoveredAction['category'] = 'STATE_MUTATION';
          let actionType: DiscoveredAction['actionType'] = 'CLICK';
          if (ctrl.tag === 'SELECT' || ctrl.type === 'checkbox' || ctrl.type === 'radio') {
            category = 'CONFIGURABLE_ITEM';
            actionType = ctrl.tag === 'SELECT' ? 'SELECT' : 'CHECK';
          }

          const locator = safeCardTitle
            ? `${targetCard.cardTag}:has-text("${safeCardTitle}") >> :visible:has-text("${safeCtrlLabel}")`
            : `:visible:has-text("${safeCtrlLabel}")`;

          actions.push({
            id: `card_${targetCard.cardIdx + 1}_secondary_${ctrlLabel.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`,
            category,
            locator,
            actionType,
            value: actionType === 'SELECT' ? '1' : undefined,
            description: `Perform "${ctrlLabel}" on "${cardLabel}"`,
            expectedInvariant: `Triggers "${ctrlLabel}" on "${cardLabel}"`,
          });
        }
      }
    }
  }

  return actions.slice(0, maxBreadth);
}
