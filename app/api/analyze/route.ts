import { NextRequest, NextResponse } from 'next/server';
import { LEGAL_SYSTEM, MODE_INSTRUCTIONS, jurisdictionNote } from '@/lib/legal-system';

export const runtime = 'nodejs';
// Vercel Hobby + Fluid Compute supports up to 300s. Keep a small buffer so
// we can return a useful error before the platform terminates the function.
export const maxDuration = 300;

const MAX_RECORD_CHARS = 350_000;
const MAX_QUESTION_CHARS = 12_000;
const MODEL_TIMEOUT_MS = 285_000;
const OPENROUTER_DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash';

type Provider = 'openrouter' | 'openai' | 'anthropic' | 'gemini';

type AnalyzeBody = {
  provider?: Provider;
  apiKey?: string;
  model?: string;
  jurisdiction?: string;
  mode?: string;
  question?: string;
  record?: string;
};

type ModelResult = {
  text: string;
  reasoningTokens?: number;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function modelSignal() {
  return AbortSignal.timeout(MODEL_TIMEOUT_MS);
}

function extractOpenAIText(data: any): string {
  if (typeof data?.output_text === 'string') return data.output_text;
  if (Array.isArray(data?.output)) {
    return data.output.flatMap((item: any) => item?.content ?? []).map((part: any) => part?.text ?? '').filter(Boolean).join('\n');
  }
  return '';
}

async function callOpenRouter(apiKey: string, model: string, system: string, user: string): Promise<ModelResult> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://reanalysislegal.vercel.app',
      'X-Title': 'Reanalysis Legal'
    },
    body: JSON.stringify({
      model: model || OPENROUTER_DEFAULT_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      max_tokens: 8000,
      reasoning: { effort: 'high' },
      usage: { include: true }
    }),
    signal: modelSignal()
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `OpenRouter request failed (${res.status})`);

  const text = data?.choices?.[0]?.message?.content || '';
  const reasoningTokens =
    data?.usage?.completion_tokens_details?.reasoning_tokens ??
    data?.usage?.completionTokensDetails?.reasoningTokens;

  return { text, reasoningTokens };
}

async function callOpenAI(apiKey: string, model: string, system: string, user: string): Promise<ModelResult> {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: system }] },
        { role: 'user', content: [{ type: 'input_text', text: user }] }
      ],
      max_output_tokens: 8000
    }),
    signal: modelSignal()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI request failed (${res.status})`);
  return { text: extractOpenAIText(data) };
}

async function callAnthropic(apiKey: string, model: string, system: string, user: string): Promise<ModelResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model, max_tokens: 8000, system, messages: [{ role: 'user', content: user }] }),
    signal: modelSignal()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic request failed (${res.status})`);
  return { text: (data?.content || []).map((p: any) => (p?.type === 'text' ? p.text : '')).filter(Boolean).join('\n') };
}

async function callGemini(apiKey: string, model: string, system: string, user: string): Promise<ModelResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: 8000 }
    }),
    signal: modelSignal()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Gemini request failed (${res.status})`);
  return { text: (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').filter(Boolean).join('\n') };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AnalyzeBody;
    const provider = body.provider;
    const suppliedApiKey = (body.apiKey || '').trim();
    const model = (body.model || '').trim();
    const record = (body.record || '').trim();
    const question = (body.question || '').trim().slice(0, MAX_QUESTION_CHARS);
    const mode = body.mode || 'qa';
    const jurisdiction = body.jurisdiction || 'Not specified';

    if (!provider || !['openrouter', 'openai', 'anthropic', 'gemini'].includes(provider)) return jsonError('Choose a supported AI provider.');

    const apiKey = provider === 'openrouter'
      ? suppliedApiKey || (process.env.OPENROUTER_API_KEY || '').trim()
      : suppliedApiKey;

    if (!apiKey) {
      if (provider === 'openrouter') {
        return jsonError('OpenRouter is not configured on this deployment. Set OPENROUTER_API_KEY in Vercel, or enter an OpenRouter key for this request.');
      }
      return jsonError('Enter your provider API key. It is used for this request only and is not stored by this app.');
    }

    const resolvedModel = model || (provider === 'openrouter' ? OPENROUTER_DEFAULT_MODEL : '');
    if (!resolvedModel) return jsonError('Enter a model ID.');
    if (!record) return jsonError('Add at least one document or paste record text first.');
    if (!question && mode === 'qa') return jsonError('Ask a question, or choose a structured analysis mode.');

    const clipped = record.slice(0, MAX_RECORD_CHARS);
    const truncated = record.length > MAX_RECORD_CHARS;
    const task = MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.qa;
    const system = `${LEGAL_SYSTEM}\n\n${jurisdictionNote(jurisdiction)}`;
    const user = `${task}\n\nUSER REQUEST:\n${question || 'Perform the selected analysis.'}\n\nSUPPLIED RECORD${truncated ? ' (TRUNCATED BY APPLICATION LIMIT — disclose this limitation)' : ''}:\n${clipped}`;

    let result: ModelResult = { text: '' };
    if (provider === 'openrouter') result = await callOpenRouter(apiKey, resolvedModel, system, user);
    if (provider === 'openai') result = await callOpenAI(apiKey, resolvedModel, system, user);
    if (provider === 'anthropic') result = await callAnthropic(apiKey, resolvedModel, system, user);
    if (provider === 'gemini') result = await callGemini(apiKey, resolvedModel, system, user);
    if (!result.text) throw new Error('The model returned an empty response.');

    return NextResponse.json(
      {
        answer: result.text,
        truncated,
        analyzedChars: clipped.length,
        model: resolvedModel,
        reasoningTokens: result.reasoningTokens
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    const isTimeout =
      error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');

    if (isTimeout) {
      return jsonError(
        'The AI analysis took longer than 4 minutes 45 seconds. Try a smaller document set, a more focused question, or a faster model.',
        504
      );
    }

    const message = error instanceof Error ? error.message : 'Analysis failed.';
    return jsonError(message, 500);
  }
}
