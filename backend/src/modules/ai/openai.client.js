import { config } from '../../config/index.js';

export const isAiEnabled = () => Boolean(config.openai.apiKey);

const headers = () => ({ Authorization: `Bearer ${config.openai.apiKey}` });

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Chat Completions in JSON mode with one retry on transient failures.
 * Returns `{ ok, data, reason }` so callers can tell "no key" from "API error" and mark degraded UX.
 */
export async function completeJsonDetailed({ system, user, temperature = 0.3, timeoutMs = 30_000, maxTokens }) {
  if (!isAiEnabled()) return { ok: false, data: null, reason: 'unavailable' };

  let lastReason = 'error';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${config.openai.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.openai.model,
          temperature,
          response_format: { type: 'json_object' },
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const body = await response.text();
        console.error('[ai] OpenAI request failed:', response.status, body);
        lastReason = 'error';
        if (RETRYABLE.has(response.status) && attempt === 0) {
          await sleep(400);
          continue;
        }
        return { ok: false, data: null, reason: 'error' };
      }
      const data = await response.json();
      const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? 'null');
      if (!parsed || typeof parsed !== 'object') return { ok: false, data: null, reason: 'error' };
      return { ok: true, data: parsed, reason: 'openai' };
    } catch (error) {
      console.error('[ai] OpenAI request error:', error.message);
      lastReason = 'error';
      if (attempt === 0) {
        await sleep(400);
        continue;
      }
    }
  }
  return { ok: false, data: null, reason: lastReason };
}

/** Returns parsed JSON or `null` when no key is configured or the request fails. */
export async function completeJson(options) {
  const result = await completeJsonDetailed(options);
  return result.ok ? result.data : null;
}

/**
 * Turns a short recording (webm, ogg, mp4/m4a, wav, mp3) into text. `prompt`: words to expect (names, product
 * terms), which helps spelling. Returns '' when nothing was said, null when it failed.
 */
export async function transcribeAudio({ audio, mimeType, prompt = '' }) {
  if (!isAiEnabled()) return null;
  const extension = /mp4|m4a|aac/.test(mimeType) ? 'm4a' : /ogg/.test(mimeType) ? 'ogg' : /wav/.test(mimeType) ? 'wav' : /mpeg|mp3/.test(mimeType) ? 'mp3' : 'webm';
  const form = new FormData();
  form.append('file', new Blob([audio], { type: mimeType.split(';')[0] }), `speech.${extension}`);
  form.append('model', config.openai.transcribeModel);
  form.append('response_format', 'json');
  if (prompt) form.append('prompt', prompt.slice(0, 800));
  try {
    const response = await fetch(`${config.openai.baseUrl}/audio/transcriptions`, { method: 'POST', headers: headers(), body: form, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      console.error('[ai] transcription failed:', response.status, await response.text());
      return null;
    }
    const data = await response.json();
    return typeof data.text === 'string' ? data.text.trim() : '';
  } catch (error) {
    console.error('[ai] transcription error:', error.message);
    return null;
  }
}

/** Embedding vectors for meaning-based search, in the order of `texts`; null when it failed. */
export async function embedTexts(texts) {
  if (!isAiEnabled() || !texts.length) return null;
  try {
    const response = await fetch(`${config.openai.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.openai.embeddingModel, input: texts.map((text) => text.slice(0, 8000)) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      console.error('[ai] embedding failed:', response.status, await response.text());
      return null;
    }
    const data = await response.json();
    return [...data.data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
  } catch (error) {
    console.error('[ai] embedding error:', error.message);
    return null;
  }
}
