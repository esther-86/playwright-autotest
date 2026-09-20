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
 * Identifies high-value QA targets: search, catalogs, filters, and tables.
 */
function createAntigravityHeuristicBrain(): LLMBrain {
  return {
    providerName: 'Antigravity / Heuristic',
    decideNextStep: async (elements: PageElement[]): Promise<BrainDecision> => {
      // Priority 1: If an interactive search box is visible, trigger search invariants
      const search = elements.find((e) => e.role === 'searchbox' || /search/i.test(e.name));
      if (search) {
        return { action: 'TEST_INVARIANT', invariantId: 'IDENTITY_ROUND_TRIP', reason: 'Search input detected on page' };
      }

      // Priority 2: If sorting dropdown exists, trigger sorting invariant
      const sort = elements.find((e) => e.role === 'combobox' || /sort/i.test(e.name));
      if (sort) {
        return { action: 'TEST_INVARIANT', invariantId: 'SORTING_ORDER', reason: 'Sort controls detected on page' };
      }

      // Priority 3: Navigate into catalog or product category links
      const categoryLink = elements.find(
        (e) => e.role === 'link' && /(shop|store|product|catalog|find-bugs|items|category)/i.test(e.name)
      );
      if (categoryLink) {
        return { action: 'CLICK', target: categoryLink.selector, reason: `Navigating to catalog: "${categoryLink.name}"` };
      }

      // Fallback: Click first unexplored navigation link
      const navLink = elements.find((e) => e.role === 'link' && e.name.length > 3);
      if (navLink) {
        return { action: 'CLICK', target: navLink.selector, reason: `Exploring link: "${navLink.name}"` };
      }

      return { action: 'STOP', reason: 'No further exploratory paths identified' };
    },
  };
}

/**
 * 2. Ollama Local Brain (Free, local LLM running on machine)
 */
function createOllamaBrain(): LLMBrain {
  return {
    providerName: 'Ollama Local',
    decideNextStep: async (elements, currentUrl) => {
      const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const prompt = `You are a QA Explorer. URL: ${currentUrl}. Interactive elements: ${JSON.stringify(
        elements.slice(0, 15)
      )}. Return JSON with {"action": "CLICK"|"TEST_INVARIANT"|"STOP", "target": "selector", "reason": "why"}.`;

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

      // Simple REST call to Gemini 1.5 Flash
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const prompt = `You are a QA Explorer. Page: ${currentUrl}. Available controls: ${JSON.stringify(
        elements.slice(0, 20)
      )}. Pick the single best action to find bugs or tables. Output JSON: {"action": "CLICK"|"TEST_INVARIANT"|"STOP", "target": "selector", "reason": "why"}.`;

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
