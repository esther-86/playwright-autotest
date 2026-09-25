import dotenv from 'dotenv';
import path from 'path';

// Always use this project's .env as the source of runtime configuration.
// override prevents inherited shell/IDE values from silently winning, while
// quiet avoids dotenv diagnostics consuming terminal/debug output.
dotenv.config({
  path: path.resolve(process.cwd(), '.env'),
  override: true,
  quiet: true,
});

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
  invariantMode: 'SMART' | 'ALL';
  maxJourneysToTest: number;
  journeyTimeBudgetSeconds: number;
  llmJudgeEnabled: boolean;
  llmJudgeModel: string;
  llmJudgeMinConfidence: number;
  llmJudgeIncludeScreenshots: boolean;
  llmDiscoveryEnabled: boolean;
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
  invariantMode: ((process.env.INVARIANT_MODE || 'SMART').toUpperCase() === 'ALL' ? 'ALL' : 'SMART'),
  maxJourneysToTest: parseInt(process.env.MAX_JOURNEYS_TO_TEST || '0', 10),
  journeyTimeBudgetSeconds: parseInt(process.env.JOURNEY_TIME_BUDGET_SECONDS || '60', 10),
  llmJudgeEnabled: process.env.LLM_JUDGE_ENABLED?.toLowerCase() === 'true',
  llmJudgeModel: process.env.LLM_JUDGE_MODEL || '',
  llmJudgeMinConfidence: Math.min(
    1,
    Math.max(0, parseFloat(process.env.LLM_JUDGE_MIN_CONFIDENCE || '0.8'))
  ),
  llmJudgeIncludeScreenshots: process.env.LLM_JUDGE_SCREENSHOTS?.toLowerCase() === 'true',
  llmDiscoveryEnabled: process.env.LLM_DISCOVERY_ENABLED?.toLowerCase() === 'true',
};
