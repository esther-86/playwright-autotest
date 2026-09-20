import { BrainDecision, LLMBrain, PageElement } from './types';

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
 * 1. Antigravity / Smart Heuristic Brain (Free, runs anywhere, $0 cost)
 * Filters out legal/cookie fluff and targets high-value QA features.
 */
function createAntigravityHeuristicBrain(): LLMBrain {
  return {
    providerName: 'Antigravity / Heuristic',
    decideNextStep: async (elements: PageElement[]): Promise<BrainDecision> => {
      // 1. Dismiss cookie banner if present
      const cookieBtn = elements.find((e) => /accept\s*cookies|functional\s*only/i.test(e.name));
      if (cookieBtn) {
        return { action: 'CLICK', target: cookieBtn.selector, reason: 'Dismissing cookie banner to unblock view' };
      }

      // 2. Check for Per-Page limit controls (triggers AcademyBugs bug!)
      const perPageBtn = elements.find((e) => e.role === 'link' && e.name === '10');
      if (perPageBtn) {
        return { action: 'TEST_INVARIANT', invariantId: 'PER_PAGE_LIMIT', reason: 'Per-page (View 10) controls detected' };
      }

      // 3. If sorting controls exist, test sorting
      const sort = elements.find((e) => e.role === 'combobox' || /sort/i.test(e.name));
      if (sort) {
        return { action: 'TEST_INVARIANT', invariantId: 'SORTING_ORDER', reason: 'Sorting dropdown detected' };
      }

      // 4. If searchbox exists, test Canary & Identity
      const search = elements.find((e) => e.role === 'searchbox' || /search/i.test(e.name));
      if (search) {
        return { action: 'TEST_INVARIANT', invariantId: 'CANARY_ZERO_STATE', reason: 'Search input detected' };
      }

      // 5. Explore real content links (filter out boilerplate legal/cookie links)
      const isBoilerplate = (name: string) =>
        /(cookie|privacy|terms|policy|skip to content|disclaimer|copyright)/i.test(name);

      const contentLink = elements.find(
        (e) =>
          e.role === 'link' &&
          !isBoilerplate(e.name) &&
          /(shoes|jeans|tshirt|product|store|shop|cart|bugs|find)/i.test(e.name)
      );

      if (contentLink) {
        return { action: 'CLICK', target: contentLink.selector, reason: `Exploring product/feature: "${contentLink.name}"` };
      }

      // 6. Fallback to any non-boilerplate link
      const generalLink = elements.find((e) => e.role === 'link' && !isBoilerplate(e.name) && e.name.length > 2);
      if (generalLink) {
        return { action: 'CLICK', target: generalLink.selector, reason: `Exploring page: "${generalLink.name}"` };
      }

      return { action: 'STOP', reason: 'No actionable elements found' };
    },
  };
}

/**
 * 2. Ollama Local Brain
 */
function createOllamaBrain(): LLMBrain {
  return {
    providerName: 'Ollama Local',
    decideNextStep: async (elements, currentUrl) => {
      const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const prompt = `You are a QA Explorer. URL: ${currentUrl}. Interactive elements: ${JSON.stringify(
        elements.slice(0, 15)
      )}. Return JSON: {"action": "CLICK"|"TEST_INVARIANT"|"STOP", "target": "selector", "reason": "why"}.`;

      try {
        const res = await fetch(`${baseUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'llama3.2', prompt, stream: false, format: 'json' }),
        });
        const data: any = await res.json();
        return JSON.parse(data.response);
      } catch {
        return createAntigravityHeuristicBrain().decideNextStep(elements, currentUrl);
      }
    },
  };
}

/**
 * 3. Gemini API Brain
 */
function createGeminiBrain(): LLMBrain {
  return {
    providerName: 'Google Gemini',
    decideNextStep: async (elements, currentUrl) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return createAntigravityHeuristicBrain().decideNextStep(elements, currentUrl);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const prompt = `You are a QA Explorer. Page: ${currentUrl}. Controls: ${JSON.stringify(
        elements.slice(0, 20)
      )}. Output JSON: {"action": "CLICK"|"TEST_INVARIANT"|"STOP", "target": "selector", "reason": "why"}.`;

      try {
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
        return createAntigravityHeuristicBrain().decideNextStep(elements, currentUrl);
      }
    },
  };
}

/**
 * 4. OpenAI API Brain
 */
function createOpenAIBrain(): LLMBrain {
  return {
    providerName: 'OpenAI',
    decideNextStep: async (elements, currentUrl) => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return createAntigravityHeuristicBrain().decideNextStep(elements, currentUrl);

      const prompt = `You are a QA Explorer. Page: ${currentUrl}. Controls: ${JSON.stringify(
        elements.slice(0, 20)
      )}. Output JSON: {"action": "CLICK"|"TEST_INVARIANT"|"STOP", "target": "selector", "reason": "why"}.`;

      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
          }),
        });
        const data: any = await res.json();
        return JSON.parse(data.choices[0].message.content);
      } catch {
        return createAntigravityHeuristicBrain().decideNextStep(elements, currentUrl);
      }
    },
  };
}
