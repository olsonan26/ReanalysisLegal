import { NextRequest, NextResponse } from 'next/server';
import { LEGAL_SYSTEM, MODE_INSTRUCTIONS, jurisdictionNote } from '@/lib/legal-system';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_RECORD_CHARS = 350_000;
const MAX_QUESTION_CHARS = 12_000;

type Provider = 'openai' | 'anthropic' | 'gemini';

type AnalyzeBody = {
  provider?: Provider;
  apiKey?: string;
  model?: string;
  jurisdiction?: string;
  mode?: string;
  question?: string;
  record?: string;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function extractOpenAIText(data: any): string {
  if (typeof data?.output_text === 'string') return data.output_text;
  if (Array.isArray(data?.output)) {
    return data.output.flatMap((item: any) => item?.content ?? []).map((part: any) => part?.text ?? '').filter(Boolean).join('\n');
  }
  return '';
}

async function callOpenAI(apiKey: string, model: string, system: string, user: string) {
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
    signal: AbortSignal.timeout(115_000)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI request failed (${res.status})`);
  return extractOpenAIText(data);
}

async function callAnthropic(apiKey: string, model: string, system: string, user: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model, max_tokens: 8000, system, messages: [{ role: 'user', content: user }] }),
    signal: AbortSignal.timeout(115_000)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic request failed (${res.status})`);
  return (data?.content || []).map((p: any) => (p?.type === 'text' ? p.text : '')).filter(Boolean).join('\n');
}

async function callGemini(apiKey: string, model: string, system: string, user: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: 8000 }
    }),
    signal: AbortSignal.timeout(115_000)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Gemini request failed (${res.status})`);
  return (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').filter(Boolean).join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AnalyzeBody;
    const provider = body.provider;
    const apiKey = (body.apiKey || '').trim();
    const model = (body.model || '').trim();
    const record = (body.record || '').trim();
    const question = (body.question || '').trim().slice(0, MAX_QUESTION_CHARS);
    const mode = body.mode || 'qa';
    const jurisdiction = body.jurisdiction || 'Not specified';

    if (!provider || !['openai', 'anthropic', 'gemini'].includes(provider)) return jsonError('Choose a supported AI provider.');
    if (!apiKey) return jsonError('Enter your provider API key. It is used for this request only and is not stored by this app.');
    if (!model) return jsonError('Enter a model ID.');
    if (!record) return jsonError('Add at least one document or paste record text first.');
    if (!question && mode === 'qa') return jsonError('Ask a question, or choose a structured analysis mode.');

    const clipped = record.slice(0, MAX_RECORD_CHARS);
    const truncated = record.length > MAX_RECORD_CHARS;
    const task = MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.qa;
    const system = `${LEGAL_SYSTEM}\n\n${jurisdictionNote(jurisdiction)}`;
    const user = `${task}\n\nUSER REQUEST:\n${question || 'Perform the selected analysis.'}\n\nSUPPLIED RECORD${truncated ? ' (TRUNCATED BY APPLICATION LIMIT — disclose this limitation)' : ''}:\n${clipped}`;

    let answer = '';
    if (provider === 'openai') answer = await callOpenAI(apiKey, model, system, user);
    if (provider === 'anthropic') answer = await callAnthropic(apiKey, model, system, user);
    if (provider === 'gemini') answer = await callGemini(apiKey, model, system, user);
    if (!answer) throw new Error('The model returned an empty response.');

    return NextResponse.json({ answer, truncated, analyzedChars: clipped.length }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed.';
    return jsonError(message, 500);
  }
}
