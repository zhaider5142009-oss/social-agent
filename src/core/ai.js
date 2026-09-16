import { config } from '../config.js';
import { info, warn, error } from './logger.js';

const DEFAULT_TIMEOUT = 120000;
const MAX_CONCURRENT = 1;
const DEFAULT_MAX_TOKENS = 2048;
const BACKUP_MODELS = ['gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'];

class Queue {
  constructor(limit) {
    this.limit = limit;
    this.active = 0;
    this.waiters = [];
  }
  async run(fn) {
    if (this.active >= this.limit) {
      await new Promise((r) => this.waiters.push(r));
    }
    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
      if (this.waiters.length) this.waiters.shift()();
    }
  }
}

function extractJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {}
  const fenced = trimmed.match(/(?:```(?:json)?\s*)([\s\S]*?)(?:\s*```)/);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)); } catch {}
  }
  return null;
}

class Ai {
  constructor() {
    this.queue = new Queue(MAX_CONCURRENT);
    this.tokensIn = 0;
    this.tokensOut = 0;
    this.calls = 0;
    this.fallbackCount = 0;
    this.breakerOpenUntil = 0;
    this.consecutiveFailures = 0;
    this.provider = config.gemini.apiKey ? 'gemini' : config.openrouter.apiKey ? 'openrouter' : 'none';
  }

  setProvider(provider) {
    this.provider = provider;
  }

  async chat({ system, user, model, json = false, temperature = 0.7, maxTokens = DEFAULT_MAX_TOKENS, signal, provider }) {
    const useProvider = provider || this.provider;
    
    if (useProvider === 'gemini') {
      if (!config.gemini.apiKey) {
        warn('ai', 'No Gemini key. Using heuristic fallback.');
        this.fallbackCount += 1;
        return json ? this._heuristicJson(system, user) : this._heuristicText(system, user);
      }
      return this.queue.run(() => this._chatGemini({ system, user, model, json, temperature, maxTokens, signal }));
    }
    
    if (!config.openrouter.apiKey) {
      warn('ai', 'No OpenRouter key. Using heuristic fallback.');
      this.fallbackCount += 1;
      return json ? this._heuristicJson(system, user) : this._heuristicText(system, user);
    }
    if (Date.now() < this.breakerOpenUntil) {
      this.fallbackCount += 1;
      return json ? this._heuristicJson(system, user) : this._heuristicText(system, user);
    }
    return this.queue.run(() => this._chatOpenRouter({ system, user, model, json, temperature, maxTokens, signal }));
  }

  _noteFailure() {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= 3) {
      this.breakerOpenUntil = Date.now() + 180000;
      warn('ai', 'Circuit breaker open for 3 min after repeated failures.');
      this.consecutiveFailures = 0;
    }
  }

  _noteSuccess() {
    this.consecutiveFailures = 0;
  }

  async _chatOpenRouter({ system, user, model, json, temperature, maxTokens, signal, retries = 2 }) {
    const body = {
      model: model || config.openrouter.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature,
      max_tokens: maxTokens,
    };
    if (json) body.response_format = { type: 'json_object' };

    const controller = new AbortController();
    const timeout = signal ? 0 : DEFAULT_TIMEOUT;
    const timer = timeout ? setTimeout(() => controller.abort(), timeout) : null;

    let fetchSignal;
    if (signal) {
      fetchSignal = signal;
    } else {
      fetchSignal = controller.signal;
    }

    let res;
    try {
      res = await fetch(config.openrouter.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.openrouter.apiKey}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Social Agent',
        },
        body: JSON.stringify(body),
        signal: fetchSignal,
      });
    } catch (e) {
      if (timer) clearTimeout(timer);
      error('ai', `OpenRouter request failed: ${e.message}`);
      this._noteFailure();
      this.fallbackCount += 1;
      return json ? this._heuristicJson(system, user) : this._heuristicText(system, user);
    }
    if (timer) clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 429 || res.status === 402) {
        if (retries > 0) {
          warn('ai', `OpenRouter rate/budget (${res.status}) — retrying with backoff (${retries} left).`);
          await new Promise((r) => setTimeout(r, 4000 + Math.random() * 6000));
          return this._chatOpenRouter({ system, user, model, json, temperature, maxTokens, signal, retries: retries - 1 });
        }
        error('ai', `OpenRouter quota exhausted after retries (${res.status}). Falling back.`);
        this._noteFailure();
        this.fallbackCount += 1;
        return json ? this._heuristicJson(system, user) : this._heuristicText(system, user);
      }
      error('ai', `OpenRouter ${res.status}: ${text.slice(0, 300)}`);
      this._noteFailure();
      this.fallbackCount += 1;
      return json ? this._heuristicJson(system, user) : this._heuristicText(system, user);
    }

    this._noteSuccess();
    const data = await res.json();
    const msg = data.choices?.[0]?.message?.content ?? '';
    this.tokensIn += data.usage?.prompt_tokens ?? 0;
    this.tokensOut += data.usage?.completion_tokens ?? 0;
    this.calls += 1;
    info('ai', `openrouter ok (${data.usage?.prompt_tokens ?? 0} in / ${data.usage?.completion_tokens ?? 0} out)`);

    if (json) {
      const parsed = extractJson(msg);
      return parsed ?? { raw: msg };
    }
    return msg;
  }

  async _chatGemini({ system, user, model, json, temperature, maxTokens, signal, retries = 2 }) {
    const passed = (model || '').trim();
    // Chain of models to try in order (flash-latest first, fall back if over capacity).
    const candidates = passed && !passed.includes('/')
      ? [passed, ...BACKUP_MODELS.filter((m) => m !== passed)]
      : [config.gemini.model, ...BACKUP_MODELS.filter((m) => m !== config.gemini.model)];

    const contents = [
      { role: 'user', parts: [{ text: system }] },
      { role: 'model', parts: [{ text: 'Understood. I will follow these instructions.' }] },
      { role: 'user', parts: [{ text: user }] },
    ];

    const body = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        responseMimeType: json ? 'application/json' : 'text/plain',
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    };

    let lastErr = null;
    for (const geminiModel of candidates) {
      const url = `${config.gemini.url}/${geminiModel}:generateContent?key=${config.gemini.apiKey}`;

      const controller = new AbortController();
      const timeout = signal ? 0 : Math.max(15000, Math.min(DEFAULT_TIMEOUT, 30000));
      const timer = timeout ? setTimeout(() => controller.abort(), timeout) : null;
      const fetchSignal = signal || controller.signal;

      let res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: fetchSignal,
        });
      } catch (e) {
        if (timer) clearTimeout(timer);
        lastErr = e;
        warn('ai', `Gemini ${geminiModel} request failed: ${e.message} — trying next model`);
        continue;
      }
      if (timer) clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const retryable = res.status === 429 || res.status === 503 || res.status === 500 || res.status === 400;
        if (retryable) {
          lastErr = new Error(`gemini ${geminiModel} ${res.status}: ${text.slice(0, 120)}`);
          if (candidates.length === 1 && retries > 0) {
            warn('ai', `Gemini ${geminiModel} ${res.status} — retrying (${retries} left).`);
            await new Promise((r) => setTimeout(r, 4000 + Math.random() * 6000));
            return this._chatGemini({ system, user, model, json, temperature, maxTokens, signal, retries: retries - 1 });
          }
          warn('ai', `Gemini ${geminiModel} ${res.status} — trying next model. ${text.slice(0, 100)}`);
          continue;
        }
        if (res.status === 404) {
          lastErr = new Error(text.slice(0, 120));
          warn('ai', `Gemini model ${geminiModel} not found — trying next`);
          continue;
        }
        lastErr = new Error(`gemini ${res.status}: ${text.slice(0, 300)}`);
        error('ai', `Gemini ${res.status}: ${text.slice(0, 300)}`);
        this._noteFailure();
        this.fallbackCount += 1;
        return json ? this._heuristicJson(system, user) : this._heuristicText(system, user);
      }

      this._noteSuccess();
      const data = await res.json();
      const msg = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const usage = data.usageMetadata || {};
      this.tokensIn += usage.promptTokenCount ?? 0;
      this.tokensOut += usage.candidatesTokenCount ?? 0;
      this.calls += 1;
      info('ai', `gemini ${geminiModel} ok (${usage.promptTokenCount ?? 0} in / ${usage.candidatesTokenCount ?? 0} out)`);

      if (json) {
        const parsed = extractJson(msg);
        return parsed ?? { raw: msg };
      }
      return msg;
    }

    // All models failed / overloaded
    error('ai', `All Gemini models failed${lastErr ? `: ${lastErr.message}` : ''}. Falling back.`);
    this._noteFailure();
    this.fallbackCount += 1;
    return json ? this._heuristicJson(system, user) : this._heuristicText(system, user);
  }

  async plan(system, user, opts = {}) {
    return await this.chat({ ...opts, system, user, json: true, temperature: 0.4 });
  }

  stats() {
    return { calls: this.calls, in: this.tokensIn, out: this.tokensOut, fallbacks: this.fallbackCount, provider: this.provider };
  }

  _heuristicText(system, user) {
    if (user.includes('reply') || system.includes('reply')) {
      return 'Thanks for reaching out! I really appreciate the message and will get back to you shortly.';
    }
    return 'Draft generated while offline. Configure an AI provider for full intelligence.';
  }

  _heuristicJson(system) {
    if (system.includes('reply')) {
      return { reply: 'Thanks for reaching out! I appreciate it and will follow up shortly.' };
    }
    if (system.includes('post')) {
      return { text: 'Building the future of autonomous social media — one post at a time.' };
    }
    if (system.includes('plan')) {
      return { reasoning: 'offline fallback: no planning actions this cycle', actions: [] };
    }
    return {};
  }
}

export const ai = new Ai();