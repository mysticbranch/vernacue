import type { AIRequest, Provider } from '../core/types';
import { prompt } from './contracts';
export function requestSpec(r: AIRequest, key: string): { url: string; init: RequestInit } {
  const p = prompt(r);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let url: string, body: unknown;
  if (r.provider === 'gemini') {
    headers['x-goog-api-key'] = key;
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(r.model.replace(/^models\//, ''))}:generateContent`;
    body = {
      systemInstruction: { parts: [{ text: p.instructions }] },
      contents: [{ role: 'user', parts: [{ text: p.input }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
    };
  } else {
    headers.Authorization = `Bearer ${key}`;
    if (r.provider === 'openai') {
      url = 'https://api.openai.com/v1/responses';
      body = {
        model: r.model,
        instructions: p.instructions,
        input: p.input,
        max_output_tokens: 4096,
        store: false,
        text: { format: { type: 'json_object' } },
      };
    } else {
      url =
        r.provider === 'groq'
          ? 'https://api.groq.com/openai/v1/chat/completions'
          : 'https://openrouter.ai/api/v1/chat/completions';
      body = {
        model: r.model,
        messages: [
          { role: 'system', content: p.instructions },
          { role: 'user', content: p.input },
        ],
        max_tokens: 4096,
      };
    }
  }
  return {
    url,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'omit',
      redirect: 'error',
    },
  };
}
export function responseText(data: any, provider: Provider): string {
  if (provider === 'openai') {
    if (data.status === 'incomplete')
      throw new Error('The AI answer reached its length limit. Use a shorter subtitle.');
    return (data.output || [])
      .flatMap((o: any) => o.content || [])
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('');
  }
  if (provider === 'gemini') {
    const c = data.candidates?.[0];
    if (c?.finishReason && c.finishReason !== 'STOP')
      throw new Error('Gemini could not complete this answer. Try another sentence or model.');
    return (c?.content?.parts || [])
      .filter((p: any) => !p.thought)
      .map((p: any) => p.text || '')
      .join('');
  }
  if (data.choices?.[0]?.finish_reason === 'length')
    throw new Error('The AI answer reached its length limit.');
  return data.choices?.[0]?.message?.content || '';
}
export function httpError(status: number) {
  return (
    (
      {
        400: 'This model rejected the request. Select a compatible text model.',
        401: 'The API key is invalid or expired. Update it in Settings.',
        402: 'The provider requires credits. Check its billing dashboard.',
        403: 'The provider denied access. Check key restrictions, model access and region.',
        404: 'The model is unavailable. Choose another model.',
        429: 'Provider rate or quota limit reached. Check quota and try later.',
      } as Record<number, string>
    )[status] || `AI service unavailable (HTTP ${status}). Try again later.`
  );
}
export async function listModels(
  provider: Provider,
  key: string,
): Promise<{ id: string; name: string }[]> {
  const urls = {
    groq: 'https://api.groq.com/openai/v1/models',
    openai: 'https://api.openai.com/v1/models',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
    openrouter: 'https://openrouter.ai/api/v1/models',
  };
  const headers: Record<string, string> =
    provider === 'gemini' ? { 'x-goog-api-key': key } : { Authorization: `Bearer ${key}` };
  const res = await fetch(urls[provider], {
    headers,
    signal: AbortSignal.timeout(20000),
    credentials: 'omit',
    redirect: 'error',
  });
  if (!res.ok) throw new Error(httpError(res.status));
  const data = await res.json();
  if (provider === 'gemini')
    return (data.models || [])
      .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: any) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name }));
  return (data.data || [])
    .filter((m: any) =>
      provider === 'openrouter'
        ? !m.architecture?.output_modalities || m.architecture.output_modalities.includes('text')
        : !/whisper|tts|embed|image|dall-e|realtime|transcribe|audio|moderation/i.test(m.id),
    )
    .map((m: any) => ({ id: m.id, name: m.name || m.id }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name));
}
