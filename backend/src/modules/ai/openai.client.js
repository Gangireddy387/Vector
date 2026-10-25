import { config } from '../../config/index.js';

export const isAiEnabled = () => Boolean(config.openai.apiKey);

/**
 * Calls the OpenAI Chat Completions API in JSON mode.
 * Returns `null` when no key is configured or the request fails, so callers can fall back to heuristics.
 */
export async function completeJson({ system, user }) {
  if (!isAiEnabled()) return null;
  try {
    const response = await fetch(`${config.openai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.openai.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.openai.model,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      console.error('[ai] OpenAI request failed:', response.status, await response.text());
      return null;
    }
    const data = await response.json();
    return JSON.parse(data.choices?.[0]?.message?.content ?? 'null');
  } catch (error) {
    console.error('[ai] OpenAI request error:', error.message);
    return null;
  }
}
