import { config } from '../../config/index.js';

export const isAiEnabled = () => Boolean(config.openai.apiKey);

const headers = () => ({ Authorization: `Bearer ${config.openai.apiKey}` });

/**
 * Calls the OpenAI Chat Completions API in JSON mode.
 * Returns `null` when no key is configured or the request fails, so callers can fall back to heuristics.
 */
export async function completeJson({ system, user, temperature = 0.3, timeoutMs = 30_000, maxTokens }) {
  if (!isAiEnabled()) return null;
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
