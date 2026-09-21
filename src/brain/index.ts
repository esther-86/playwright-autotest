import { BrainDecision, InvariantTestSelection, LLMBrain, PageElement } from './types';

/**
 * Creates the appropriate brain based on LLM_PROVIDER in .env
 */
export function getBrain(): LLMBrain {
  const provider = (process.env.LLM_PROVIDER || 'antigravity').toLowerCase();

  switch (provider) {
    case 'gemini':
      return createGeminiBrain();
    case 'openai':
      return createOpenAIBrain();
    case 'ollama':
      return createOllamaBrain();
    case 'antigravity':
    default:
      return createAntigravityHeuristicBrain();
  }
}

/**
 * 1. Autonomous Heuristic / Semantic Brain
 * Inspects accessibility semantics and selects appropriate invariant hypotheses at runtime.
 */
function createAntigravityHeuristicBrain(): LLMBrain {
  return {
    providerName: 'Antigravity / Heuristic',

    selectInvariantsForPage: async (elements: PageElement[], currentUrl: string): Promise<InvariantTestSelection[]> => {
      const selections: InvariantTestSelection[] = [];

      // Universal invariants applicable to almost any visual HTML page
      selections.push({
        invariantId: 'CONTENT_INTEGRITY',
        reason: 'Universal check for untranslated placeholder Latin, corrupt encoding, or broken typography',
      });
      selections.push({
        invariantId: 'VISUAL_LAYOUT_GEOMETRY',
        reason: 'Universal check for visual collision with footers, form collinearity, and image rendering',
      });
      selections.push({
        invariantId: 'HYPERLINK_REACHABILITY',
        reason: 'Sample in-page contextual links to assert HTTP 2xx/3xx reachability',
      });

      // 1. Sort controls detected
      const sortCtrl = elements.find((e) => e.role === 'combobox' || /sort/i.test(e.name));
      if (sortCtrl) {
        selections.push({
          invariantId: 'SORTING_ORDER_MONOTONICITY',
          targetSelector: sortCtrl.selector,
          reason: `Sorting control "${sortCtrl.name}" detected`,
        });
      }

      // 2. Cardinality / Per-Page limit controls detected
      const perPageCtrl = elements.find((e) => /per\s*page|view\s*\d+|\b10\b|\b20\b|\b24\b|\b50\b/i.test(e.name));
      if (perPageCtrl) {
        selections.push({
          invariantId: 'CARDINALITY_UPPER_BOUND',
          targetSelector: perPageCtrl.selector,
          params: { limit: 10 },
          reason: `Per-page upper bound control "${perPageCtrl.name}" detected`,
        });
      }

      // 3. Filter facets or checkboxes detected
      const filterCtrl = elements.find((e) => e.role === 'checkbox' || /filter|facet/i.test(e.name));
      if (filterCtrl) {
        selections.push({
          invariantId: 'FILTER_MONOTONICITY',
          targetSelector: filterCtrl.selector,
          reason: `Filter facet control "${filterCtrl.name}" detected`,
        });
      }

      // 4. Numeric mutation / counter inputs detected (e.g. quantity)
      const numberInput = elements.find((e) => e.role === 'spinbutton' || /quantity|qty|count/i.test(e.name));
      if (numberInput) {
        selections.push({
          invariantId: 'MUTATION_PERSISTENCE_BOUND',
          targetSelector: numberInput.selector,
          reason: `Numeric counter input "${numberInput.name}" detected`,
        });
      }

      // 5. Checkout / cart / price totals detected
      if (/cart|checkout|basket|order/i.test(currentUrl) || elements.some((e) => /subtotal|grand\s*total|checkout/i.test(e.name))) {
        selections.push({
          invariantId: 'CART_MATH_ARITHMETIC',
          reason: 'Financial pricing summary detected on current transaction route',
        });
      }

      // 6. Interactive controls requiring liveness and error-free execution
      const hasInteractiveControls = elements.some((e) => e.role === 'button' || e.role === 'combobox' || e.role === 'radio');
      if (hasInteractiveControls) {
        selections.push({
          invariantId: 'UI_THREAD_LIVENESS',
          reason: 'Interactive user controls detected; verifying thread liveness and zero unhandled crash overlays',
        });
      }

      // 7. Dynamic loaders or async update triggers detected
      const hasAsyncTriggers = elements.some((e) => /update|save|refresh|tab/i.test(e.name));
      if (hasAsyncTriggers || /dashboard|history|account/i.test(currentUrl)) {
        selections.push({
          invariantId: 'ASYNC_RESPONSE_FINALITY',
          reason: 'Asynchronous state mutations or dynamic account views detected; verifying bounded latency',
        });
      }

      // 8. External outbound links detected
      const hasOutbound = elements.some((e) => /twitter|facebook|share|external|social/i.test(e.name));
      if (hasOutbound) {
        selections.push({
          invariantId: 'OUTBOUND_URI_SYNTAX',
          reason: 'Outbound external service links detected; verifying RFC URI syntax and domain TLD validity',
        });
      }

      // 9. Call-To-Action buttons and interactive elements
      const hasCta = elements.some((e) => e.role === 'button' || e.role === 'link');
      if (hasCta) {
        selections.push({
          invariantId: 'INTERACTIVE_ACTION_INTEGRITY',
          reason: 'Verifying interactive buttons produce state mutations and do not silently no-op with dead links',
        });
      }

      return selections;
    },

    decideNextStep: async (elements: PageElement[]): Promise<BrainDecision> => {
      // 1. Dismiss cookie banner if present
      const cookieBtn = elements.find((e) => /accept\s*cookies|functional\s*only/i.test(e.name));
      if (cookieBtn) {
        return { action: 'CLICK', target: cookieBtn.selector, reason: 'Dismissing cookie banner to unblock view' };
      }

      // 2. Discover and explore functional content links (filtering legal/cookie fluff)
      const isBoilerplate = (name: string) =>
        /(cookie|privacy|terms|policy|skip to content|disclaimer|copyright)/i.test(name);

      const contentLink = elements.find(
        (e) =>
          e.role === 'link' &&
          !isBoilerplate(e.name) &&
          e.name.length > 2 &&
          !e.selector.includes('#')
      );

      if (contentLink) {
        return { action: 'CLICK', target: contentLink.selector, reason: `Navigating to explore route: "${contentLink.name}"` };
      }

      return { action: 'STOP', reason: 'No new actionable navigational links found' };
    },
  };
}

/**
 * 2. Gemini API Brain
 */
function createGeminiBrain(): LLMBrain {
  const fallback = createAntigravityHeuristicBrain();

  return {
    providerName: 'Google Gemini',
    selectInvariantsForPage: async (elements, currentUrl) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return fallback.selectInvariantsForPage(elements, currentUrl);

      const prompt = `You are a Metamorphic Web QA Architect.
Current URL: ${currentUrl}.
Visible Semantic Controls: ${JSON.stringify(elements.slice(0, 30))}.
Select the applicable universal metamorphic invariants for this page from:
["SORTING_ORDER_MONOTONICITY", "CARDINALITY_UPPER_BOUND", "FILTER_MONOTONICITY", "MUTATION_PERSISTENCE_BOUND", "CART_MATH_ARITHMETIC", "UI_THREAD_LIVENESS", "ASYNC_RESPONSE_FINALITY", "OUTBOUND_URI_SYNTAX", "CONTENT_INTEGRITY", "VISUAL_LAYOUT_GEOMETRY", "HYPERLINK_REACHABILITY", "INTERACTIVE_ACTION_INTEGRITY"].
Output a JSON array: [{"invariantId": string, "targetSelector"?: string, "params"?: object, "reason": string}].`;

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        });
        const data: any = await res.json();
        return JSON.parse(data.candidates[0].content.parts[0].text);
      } catch {
        return fallback.selectInvariantsForPage(elements, currentUrl);
      }
    },

    decideNextStep: async (elements, currentUrl) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return fallback.decideNextStep(elements, currentUrl);

      const prompt = `You are a Web QA Explorer. Page: ${currentUrl}. Controls: ${JSON.stringify(elements.slice(0, 20))}.
Output JSON: {"action": "CLICK"|"STOP", "target": "selector", "reason": "why"}.`;

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        });
        const data: any = await res.json();
        return JSON.parse(data.candidates[0].content.parts[0].text);
      } catch {
        return fallback.decideNextStep(elements, currentUrl);
      }
    },
  };
}

/**
 * 3. Ollama Local Brain
 */
function createOllamaBrain(): LLMBrain {
  const fallback = createAntigravityHeuristicBrain();

  return {
    providerName: 'Ollama Local',
    selectInvariantsForPage: async (elements, currentUrl) => {
      return fallback.selectInvariantsForPage(elements, currentUrl);
    },
    decideNextStep: async (elements, currentUrl) => {
      return fallback.decideNextStep(elements, currentUrl);
    },
  };
}

/**
 * 4. OpenAI API Brain
 */
function createOpenAIBrain(): LLMBrain {
  const fallback = createAntigravityHeuristicBrain();

  return {
    providerName: 'OpenAI',
    selectInvariantsForPage: async (elements, currentUrl) => {
      return fallback.selectInvariantsForPage(elements, currentUrl);
    },
    decideNextStep: async (elements, currentUrl) => {
      return fallback.decideNextStep(elements, currentUrl);
    },
  };
}
