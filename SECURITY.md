# Security and Confidentiality Notes

Reanalysis Legal handles potentially sensitive legal material. This deployment intentionally avoids persistent application storage, but it is not a zero-disclosure system.

## Data flow

1. The browser sends an uploaded document to the application's Vercel extraction function.
2. The function extracts text and returns it to the browser.
3. When analysis is requested, the browser sends the assembled record, selected model, and provider API key to the application's analysis function.
4. The function sends the prompt and record to the selected AI provider.

The application does not intentionally write documents or API keys to a database or filesystem and uses `Cache-Control: no-store` responses. Infrastructure/provider logs and processing are still governed by Vercel and the selected provider.

## User responsibilities

Before uploading privileged, confidential, personal, commercially sensitive, sealed, or legally restricted documents, determine whether this architecture and the provider's terms meet applicable professional, privacy, contractual, residency, retention, and privilege requirements.

For the strongest confidentiality posture, use a self-hosted/local deployment with a locally hosted model rather than this public Vercel edition.

## Reporting

Do not place secrets, API keys, privileged documents, or personal data in public GitHub issues.
