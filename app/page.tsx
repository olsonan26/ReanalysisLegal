'use client';

import { useMemo, useRef, useState } from 'react';

type Doc = { id: string; name: string; text: string; chars: number; truncated?: boolean };
type Provider = 'openrouter' | 'openai' | 'anthropic' | 'gemini';

const providers: Record<Provider, { label: string; model: string }> = {
  openrouter: { label: 'OpenRouter · DeepSeek', model: 'deepseek/deepseek-v4.1-flash' },
  openai: { label: 'OpenAI', model: 'gpt-5.6-sol' },
  anthropic: { label: 'Anthropic', model: 'claude-sonnet-5' },
  gemini: { label: 'Google Gemini', model: 'gemini-3.8-flash' }
};

const modes = [
  ['qa', 'Ask the Record'],
  ['issues', 'Issue Spotter'],
  ['adversarial', 'Opposing Counsel'],
  ['timeline', 'Timeline'],
  ['evidence', 'Evidence Matrix'],
  ['memo', 'Legal Memo'],
  ['contract', 'Contract Review']
] as const;

export default function Home() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [paste, setPaste] = useState('');
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState('qa');
  const [jurisdiction, setJurisdiction] = useState('New Zealand');
  const [provider, setProvider] = useState<Provider>('openrouter');
  const [model, setModel] = useState(providers.openrouter.model);
  const [apiKey, setApiKey] = useState('');
  const [answer, setAnswer] = useState('');
  const [reasoningTokens, setReasoningTokens] = useState<number | null>(null);
  const [modelUsed, setModelUsed] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const record = useMemo(() => {
    const blocks = docs.map((d, i) => `===== DOCUMENT ${i + 1}: ${d.name} =====\n${d.text}`);
    if (paste.trim()) blocks.push(`===== PASTED MATERIAL =====\n${paste.trim()}`);
    return blocks.join('\n\n');
  }, [docs, paste]);

  const totalChars = record.length;

  function switchProvider(next: Provider) {
    setProvider(next);
    setModel(providers[next].model);
    setApiKey('');
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setExtracting(true);
    setError('');
    try {
      for (const file of Array.from(files).slice(0, 8)) {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/extract', { method: 'POST', body: form, cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(`${file.name}: ${data.error || 'Could not extract document.'}`);
        setDocs((current) => [
          ...current,
          { id: `${Date.now()}-${Math.random()}`, name: data.name, text: data.text, chars: data.chars, truncated: data.truncated }
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setExtracting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function analyze() {
    setError('');
    setAnswer('');
    setReasoningTokens(null);
    setModelUsed('');
    if (!record.trim()) return setError('Add at least one document or paste legal material first.');
    if (provider !== 'openrouter' && !apiKey.trim()) return setError('Enter your AI provider API key. It stays in memory and is not saved by this app.');
    if (mode === 'qa' && !question.trim()) return setError('Ask a question or choose a structured analysis mode.');

    setBusy(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ provider, apiKey, model, jurisdiction, mode, question, record })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed.');
      setAnswer(`${data.truncated ? 'RECORD LIMIT: Only the first 350,000 characters were analyzed.\n\n' : ''}${data.answer}`);
      setModelUsed(data.model || model);
      setReasoningTokens(typeof data.reasoningTokens === 'number' ? data.reasoningTokens : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <div className="eyebrow">SOURCE-GROUNDED LEGAL DOCUMENT AI</div>
          <h1>Reanalysis <span>Legal</span></h1>
        </div>
        <div className="status"><span className="dot" /> OpenRouter · No database · No document persistence</div>
      </header>

      <section className="notice">
        <strong>Legal information, not legal advice.</strong> AI can be wrong. Verify facts, citations, deadlines and current law with authoritative sources and qualified counsel before relying on any output.
      </section>

      <div className="shell">
        <aside className="panel left">
          <div className="sectionTitle">1. Matter record</div>
          <button className="upload" onClick={() => fileRef.current?.click()} disabled={extracting}>
            <span className="uploadIcon">＋</span>
            <strong>{extracting ? 'Extracting…' : 'Add legal documents'}</strong>
            <small>PDF, DOCX, TXT, MD · max 4 MB each</small>
          </button>
          <input ref={fileRef} type="file" hidden multiple accept=".pdf,.docx,.txt,.md" onChange={(e) => addFiles(e.target.files)} />

          <div className="docs">
            {docs.map((doc) => (
              <div className="doc" key={doc.id}>
                <div className="docText">
                  <strong>{doc.name}</strong>
                  <small>{doc.chars.toLocaleString()} chars{doc.truncated ? ' · truncated' : ''}</small>
                </div>
                <button aria-label={`Remove ${doc.name}`} onClick={() => setDocs((d) => d.filter((x) => x.id !== doc.id))}>×</button>
              </div>
            ))}
          </div>

          <label className="label">Paste evidence, legislation or case excerpts</label>
          <textarea className="paste" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste text here. Label official authorities clearly so the AI can distinguish verified law from model memory." />
          <div className="recordStats">{totalChars.toLocaleString()} record characters loaded</div>

          <div className="sectionTitle space">2. Jurisdiction</div>
          <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
            <option>New Zealand</option>
            <option>Utah, United States</option>
            <option>United States</option>
            <option>England & Wales</option>
            <option>Australia</option>
            <option>Other / Not specified</option>
          </select>
          <p className="hint">Jurisdiction guides issue spotting. The system will not treat remembered law as verified current authority.</p>
        </aside>

        <section className="panel center">
          <div className="sectionTitle">3. Analysis mode</div>
          <div className="modeGrid">
            {modes.map(([id, label]) => (
              <button key={id} className={mode === id ? 'mode active' : 'mode'} onClick={() => setMode(id)}>{label}</button>
            ))}
          </div>

          <label className="label">Question / instruction</label>
          <textarea className="question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Example: What facts support Peter's interpretation, what facts cut against it, and what has not yet been proven?" />

          <div className="providerRow">
            <div>
              <label className="label">AI provider</label>
              <select value={provider} onChange={(e) => switchProvider(e.target.value as Provider)}>
                {(Object.keys(providers) as Provider[]).map((p) => <option key={p} value={p}>{providers[p].label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Model</label>
              <input value={model} onChange={(e) => setModel(e.target.value)} spellCheck={false} />
            </div>
          </div>

          <label className="label">{provider === 'openrouter' ? 'OpenRouter API key override (optional)' : 'Provider API key'}</label>
          <input className="key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" placeholder={provider === 'openrouter' ? 'Uses secure server key when left blank' : 'Used for this browser session only'} />
          <button className="privacyLink" onClick={() => setShowPrivacy((v) => !v)}>{showPrivacy ? 'Hide' : 'Show'} privacy/data-flow details</button>
          {showPrivacy && (
            <div className="privacy">
              Files are sent to this Vercel deployment for text extraction. Extracted text is then sent through the server function to the provider you select. For OpenRouter, the deployment can use a server-side <code>OPENROUTER_API_KEY</code>; it is never intentionally sent to the browser. Other provider keys entered here are used for that request only. This app does not intentionally persist document text or keys and sends <code>no-store</code> cache directives. Vercel and the selected AI provider still process the request under their own terms. Do not upload privileged/confidential material unless that data flow is acceptable to you or your lawyer/organization.
            </div>
          )}

          {error && <div className="error">{error}</div>}
          <button className="analyze" onClick={analyze} disabled={busy || extracting}>{busy ? 'Analyzing record…' : 'Analyze the Record'}</button>
          <div className="guardrail"><strong>Built-in guardrail:</strong> allegations ≠ facts · unsupplied law ≠ verified law · unsupported claims are labeled, not filled in.</div>
        </section>

        <section className="panel output">
          <div className="outputHeader">
            <div>
              <div className="sectionTitle">Analysis</div>
              <small>
                {jurisdiction} · {modes.find((m) => m[0] === mode)?.[1]}
                {modelUsed ? ` · ${modelUsed}` : ''}
                {reasoningTokens !== null ? ` · ${reasoningTokens.toLocaleString()} reasoning tokens` : ''}
              </small>
            </div>
            {answer && <button onClick={() => navigator.clipboard.writeText(answer)}>Copy</button>}
          </div>
          {!answer && !busy && (
            <div className="empty">
              <div className="seal">§</div>
              <h2>Evidence first.</h2>
              <p>Add the record, select the legal task, then interrogate it. Material conclusions should trace back to what you actually supplied.</p>
            </div>
          )}
          {busy && <div className="loading"><span />Analyzing documents and separating supported facts from assumptions…</div>}
          {answer && <pre className="answer">{answer}</pre>}
        </section>
      </div>

      <footer>
        <span>Reanalysis Legal v1.1</span>
        <span>Document analysis software — not a law firm</span>
      </footer>
    </main>
  );
}
