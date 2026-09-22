import 'dotenv/config';

export interface AppConfig {
  targetUrl: string;
  headless: boolean;
  explorationTimeSeconds: number;
  maxExplorationDepth: number;
  maxBreadthPerScreen: number;
  includeMenuHeaderFooter: boolean;
  excludedUrlPatterns: string[];
  llmProvider: 'antigravity' | 'gemini' | 'openai' | 'anthropic' | 'ollama';
  geminiApiKey: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  ollamaBaseUrl: string;
}

/**
 * Single Centralized Configuration Source of Truth.
 * All runners, brains, and explorers consume from this instance.
 */
export const config: AppConfig = {
  targetUrl: process.env.TARGET_URL || 'https://academybugs.com/find-bugs/',
  headless: process.env.HEADLESS?.toLowerCase() !== 'false',
  explorationTimeSeconds: parseInt(process.env.EXPLORATION_TIME_SECONDS || '60', 10),
  maxExplorationDepth: parseInt(process.env.MAX_EXPLORATION_DEPTH || '3', 10),
  maxBreadthPerScreen: parseInt(process.env.MAX_BREADTH_PER_SCREEN || '25', 10),
  includeMenuHeaderFooter: process.env.INCLUDE_MENU_HEADER_FOOTER?.toLowerCase() === 'true',
  excludedUrlPatterns: (process.env.EXCLUDED_URL_PATTERNS || 'cookie-policy,privacy-policy,terms')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean),
  llmProvider: (process.env.LLM_PROVIDER || 'antigravity').toLowerCase() as AppConfig['llmProvider'],
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
};
