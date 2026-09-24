import providerConfig from '../config/llm-providers.json';

const supportedGeminiVersions = new Set(['v1', 'v1beta']);

export const geminiProviderConfig = Object.freeze(providerConfig.gemini);

export function geminiEndpoint(
  model: string,
  method: 'generateContent' = 'generateContent'
): string {
  const version = geminiProviderConfig.apiVersion;
  if (!supportedGeminiVersions.has(version)) {
    throw new Error(
      `Unsupported Gemini API version "${version}" in config/llm-providers.json; use "v1" or "v1beta".`
    );
  }

  const baseUrl = geminiProviderConfig.baseUrl.replace(/\/$/, '');
  return `${baseUrl}/${version}/models/${encodeURIComponent(model)}:${method}`;
}

export function geminiHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey.trim(),
  };
}
