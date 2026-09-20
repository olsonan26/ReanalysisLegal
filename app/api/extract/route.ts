import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_FILE_BYTES = 4_000_000;
const MAX_TEXT_CHARS = 350_000;

function clean(text: string) {
  return text.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim();
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file received.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'File is larger than 4 MB. Split it or paste the relevant text.' }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
    }

    const name = file.name || 'document';
    const lower = name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    let text = '';

    if (lower.endsWith('.txt') || lower.endsWith('.md')) {
      text = buffer.toString('utf8');
    } else if (lower.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (lower.endsWith('.pdf')) {
      const pdfParse = (await import('pdf-parse')).default;
      const result = await pdfParse(buffer);
      text = result.text;
    } else {
      return NextResponse.json({ error: 'Supported files: PDF, DOCX, TXT, MD.' }, { status: 415, headers: { 'Cache-Control': 'no-store' } });
    }

    text = clean(text);
    if (!text) {
      return NextResponse.json({ error: 'No readable text was extracted. Scanned/image-only PDFs require OCR and are not supported in this Vercel build yet.' }, { status: 422, headers: { 'Cache-Control': 'no-store' } });
    }

    const truncated = text.length > MAX_TEXT_CHARS;
    return NextResponse.json(
      { name, text: text.slice(0, MAX_TEXT_CHARS), chars: text.length, truncated },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Document extraction failed.';
    return NextResponse.json({ error: message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
