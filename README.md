# ExtractIQ

ExtractIQ turns invoices and receipts — digital PDFs, flat-bed scans, or phone
photos — into structured, reviewed, exportable data. Text comes out via a
digital PDF read or an OCR fallback, an LLM running on a local Ollama server
structures it into a fixed schema, a five-signal confidence algorithm decides
how much of that structuring to trust, and a human reviews and approves or
rejects the result before it ever reaches an export.

## How it works

**Pipeline.** Each uploaded document moves through a linear state machine
(`types/status.ts`, enforced by `lib/validation/state-machine.ts`):

```
queued -> processing -> extracting_text -> running_ocr* -> running_llm
       -> validating -> awaiting_review -> completed
```

\* `running_ocr` only runs for image uploads, or for a PDF whose embedded text
layer scores too low to trust (`lib/pdf/extract.ts`'s quality check). Any
active step can instead fall through to `needs_manual_entry` (extraction
failed, OCR came back near-empty after one retry, the LLM output didn't
validate against the schema) or be reset to `queued` (Phase 13's stuck-job
sweep). `completed` and `needs_manual_entry` are terminal. The orchestrator
that drives a document through this — `lib/jobs/process-document.ts` — is
idempotent: it only ever claims a document that is still `queued`, via a
conditional update, so re-invoking it is always safe.

**Confidence.** Every extraction draft carries two independent scores:

- `overall_confidence` / `field_confidence` (`lib/confidence/score.ts`) — how
  much to trust the *data*. Per field: start from presence (100 if the LLM
  returned a non-empty value, 0 if not), discount by OCR quality when OCR ran,
  cap at 40 if an arithmetic check touching that field failed
  (`lib/validation/arithmetic.ts` checks line-items-sum-to-subtotal and
  subtotal-plus-tax-equals-total), then floor at 0 if the field was ever
  missing. The document's `overall_confidence` is the **minimum** across
  fields, not an average — one untrustworthy field makes the whole document
  untrustworthy.
- `processing_confidence` (`lib/confidence/processing-score.ts`) — how much to
  trust the *pipeline run itself*, independent of the data: starts at 100,
  loses 30 per extra full pass through the pipeline (a sweep-recovered retry),
  10 if OCR had to run at all, and 15 per logged step that failed outright.

**Review.** A document reaching `awaiting_review` has one `document_extractions`
draft. A reviewer can edit fields inline and approve (which persists the edits,
sets `review_status='approved'`, and moves the document to `completed`) or
reject (`review_status='rejected'`, also `completed`, no edits applied). Only
`approved` drafts are eligible for Records and Export.

**Screens:** Landing (`/`), Dashboard (`/dashboard`), Upload (`/upload`),
Processing (`/processing/[id]`), Review (`/review/[id]`), Records
(`/records`), Analytics (`/analytics`), Export (`/export`), Settings
(`/settings`).

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**, strict mode
- **Tailwind CSS 4** for the design system (`app/globals.css`, `components/ui/*`)
- **Supabase** (Postgres + private Storage bucket) as the only datastore —
  accessed exclusively through API routes using the service-role key
  (`lib/storage/supabase.ts`); RLS is enabled on every table with no policies,
  so the anon/public API can't touch them directly
- **Ollama**, self-hosted, for LLM structuring (`lib/ollama/*`) — no third-party
  LLM API is called
- **Tesseract.js** for OCR (`lib/ocr/*`), **pdf-parse** for digital PDF text
  extraction and page rasterization
- **Zod** for schema validation (LLM output, all API request bodies)

## Prerequisites

- Node.js 20+ (developed against Node 22)
- A Supabase project (free tier is enough)
- [Ollama](https://ollama.com) running locally (or reachable over the network)
  with a model pulled, e.g. `ollama pull llama3.2:1b`

## Getting started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Supabase project**, then run both migrations against it (SQL
   editor, or `supabase db push` with the CLI) in order:

   ```
   supabase/migrations/0001_init.sql
   supabase/migrations/0002_settings.sql
   ```

   `0001_init.sql` creates `documents`, `document_extractions`, `line_items`,
   `exports`, `processing_logs`, and a private `documents` storage bucket.
   `0002_settings.sql` creates the `app_settings` singleton (confidence
   threshold + default export format) and seeds its one row.

3. **Configure environment variables.** Copy `.env.example` to `.env.local`
   and fill in:

   | Variable | Required | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL, from Settings → API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Anon/publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | yes | Service-role key — server-side only, never exposed to the client |
   | `OLLAMA_BASE_URL` | no | Defaults to `http://localhost:11434` |
   | `OLLAMA_MODEL` | yes | Any Ollama model tag you've pulled, e.g. `llama3.2:1b` |

4. **Start Ollama** (if it isn't already running) and confirm your model is
   pulled: `ollama list`.

5. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Trying it out

`samples/` has eight generated documents (no real personal or commercial
data) built to exercise every path through the pipeline — clean digital text,
both OCR routes, a missing required field, a failed arithmetic check, an
unreadable scan, and a corrupt file. Upload them from the Upload screen and
watch them move through Processing. See `samples/README.md` for what each one
demonstrates and the exact status it should land on.

End-to-end flow: **Upload** a file → watch it progress on **Processing** →
land on **Review** once it hits `awaiting_review` → edit/approve or reject →
approved records appear on **Records** → filter and download them from
**Export** (CSV or JSON). **Settings** controls the confidence threshold
Review uses to flag low-confidence fields, and the default export format.

## Scripts

```bash
npm run dev           # start the dev server
npm run build         # production build
npm run start         # run a production build
npm run lint          # ESLint
npm run type-check    # tsc --noEmit
npm run format        # Prettier, write
npm run format:check  # Prettier, check only
```

## Stuck-job recovery

`POST /api/jobs/sweep` finds documents that have sat in a non-terminal status
for more than 10 minutes, resets them to `queued`, and re-runs the pipeline
from the top (there is no partial-resume — a stalled document restarts
completely). It exists because this project has no queue/cron infrastructure
of its own; it's meant to be triggered externally on a schedule, not called
by the app itself.

## Deployment

**Not deployed. This is a deliberate, known gap** — every other part of the
application (Phases 1–29) is complete and has been verified end-to-end
against the local dev server. Deploying to Vercel needs a **production Ollama
host reachable over the network**: Vercel's serverless functions cannot reach
`localhost:11434` on a developer's machine, and structuring will fail (or
silently fall back to `needs_manual_entry`) without one. Standing up that
host — a small VPS running Ollama, or a tunnel (ngrok/Cloudflare Tunnel/
Tailscale Funnel) into a machine that already has it — is out of scope for
this pass and is the explicit blocker on deploying.

`vercel.json` is prepared for when that host exists:

```json
{
  "crons": [{ "path": "/api/jobs/sweep", "schedule": "*/10 * * * *" }]
}
```

Two things to resolve before that cron will actually fire successfully,
**neither of which this pass touches** (this phase is documentation and local
verification only, no application code changes):

- **Method mismatch.** Vercel invokes cron jobs with an HTTP `GET` request,
  but `/api/jobs/sweep` currently exports only `POST`
  (`app/api/jobs/sweep/route.ts`). As configured today, Vercel's cron
  invocation would hit that route and get a 405. A `GET` handler (or
  reusing the existing `POST` logic under `GET`) needs to be added before
  relying on the scheduled sweep in production; until then, trigger it
  manually or via any external `POST`-capable scheduler.
- **Plan limits.** Vercel Hobby restricts cron jobs to once per day; the
  10-minute cadence above (matched to `STUCK_TIMEOUT_MS` in the sweep route)
  needs a Pro plan or higher to run as scheduled.

When deployment does happen: set `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OLLAMA_MODEL`,
and `OLLAMA_BASE_URL` (pointed at the reachable Ollama host, not
`localhost`) as Vercel project environment variables, then deploy normally
(`vercel` CLI or a connected Git repo). No code changes are expected to be
needed beyond the sweep route fix above.
