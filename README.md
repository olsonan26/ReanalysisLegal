# Reanalysis Legal

A Vercel-native, source-grounded legal document analysis interface inspired by the privacy, citation, adversarial-review, and matter-analysis ideas used in open legal AI projects such as **doc.haus**.

## What it does

- Upload PDF, DOCX, TXT, or Markdown legal documents.
- Paste evidence, statutes, regulations, case excerpts, correspondence, pleadings, contracts, or notes.
- Analyze the supplied record using Ask the Record, Issue Spotter, Opposing Counsel, Timeline, Evidence Matrix, Legal Memo, or Contract Review.
- Select a jurisdiction including New Zealand, Utah, or broader U.S. context.
- Uses **OpenRouter + `deepseek/deepseek-v4.1-flash`** as the default legal-analysis model with high reasoning effort.
- Retains optional OpenAI, Anthropic, and Google Gemini providers.
- The core system prompt requires the model to distinguish record facts, inference, legal analysis, and unverified law.

## OpenRouter configuration

Never hardcode an OpenRouter key into this public repository or into client-side React code.

Set this environment variable in Vercel for Production, Preview, and Development as appropriate:

```text
OPENROUTER_API_KEY=your_openrouter_key_here
```

After changing a Vercel environment variable, redeploy the project so the server function receives it.

The application can also accept a temporary OpenRouter key entered in the browser as an override, but the recommended production configuration is the server-side environment variable.

OpenRouter requests use:

- Model: `deepseek/deepseek-v4.1-flash`
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Reasoning effort: `high`
- Usage reporting enabled so reasoning-token counts can be displayed when returned by the provider
- `HTTP-Referer: https://reanalysislegal.vercel.app`
- `X-Title: Reanalysis Legal`

## Privacy architecture

This Vercel edition intentionally has **no application database**. The server-side OpenRouter key is read from `OPENROUTER_API_KEY` and is not intentionally sent to the browser. Other provider keys entered through the UI live only in browser memory and are sent with an individual request. Documents are sent to the Vercel function for text extraction, then extracted text is sent to the selected AI provider for analysis. Responses include `Cache-Control: no-store`.

That is not the same privacy posture as a fully local application. Vercel, OpenRouter, the underlying routed model provider, or another selected AI provider may still process the request under their respective terms. Do not use privileged or confidential material unless this data flow is acceptable under the user's professional, contractual, privacy, and legal obligations.

## Legal safety design

The system is designed to:

- never intentionally invent a factual record or legal citation;
- label unsupplied legal rules as **UNVERIFIED LAW**;
- distinguish allegations from established facts;
- identify missing evidence and contradictory evidence;
- use `[VERIFY]` / `[INSERT]` rather than inventing drafting facts;
- remind users to verify current law against authoritative sources and qualified counsel.

No AI system can guarantee legal correctness. This application is legal-information/document-analysis software, not a law firm and not a substitute for professional legal advice.

## Current limits

- Maximum uploaded file size: 4 MB per file.
- PDF support is text-layer extraction only. Image-only/scanned PDFs require OCR, which is not included in this Vercel version yet.
- Up to 350,000 record characters are sent for a single analysis request.
- It does not independently browse or verify current statutes/cases. Supply authoritative material when current-law verification matters.

## Run locally

```bash
npm install
npm run dev
```

Create `.env.local` and add:

```text
OPENROUTER_API_KEY=your_openrouter_key_here
```

## Source inspiration / attribution

The product concepts were informed by the MIT-licensed **doc.haus** project by doc.haus contributors / SureScale and its upstream OpenCode project. Reanalysis Legal's Vercel implementation in this repository was written separately rather than copying doc.haus's local Bun/Docker architecture.

See `THIRD_PARTY_NOTICES.md`.
