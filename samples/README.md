# Sample documents

Eight documents that between them exercise every path through the pipeline:
the digital-PDF text route, both OCR routes, the arithmetic sanity checks, a
missing required field, and the two ways a document ends up back in a human's
hands. Upload them from the Upload screen (or `POST /api/upload`) and watch the
Processing screen.

Every result below was produced by running the file through the unmodified
pipeline against a live Supabase project and a local Ollama running
`llama3.2:1b`. Nothing here is a fixture: no pipeline code was changed to make
a sample behave, and the numbers are what the database actually held afterwards.

| # | File | Exercises | Ends at |
|---|------|-----------|---------|
| 01 | `01-clean-digital-receipt.pdf` | Digital text layer, both arithmetic checks pass | `awaiting_review` |
| 02 | `02-clean-digital-invoice.pdf` | Digital text layer, denser invoice layout | `awaiting_review` |
| 03 | `03-missing-vendor-receipt.pdf` | A required field absent from the document | `awaiting_review` |
| 04 | `04-mismatched-totals-receipt.pdf` | Arithmetic check fails, confidence capped | `awaiting_review` |
| 05 | `05-photographed-receipt.jpg` | Image upload → OCR, tilted and softened like a phone photo | `awaiting_review` |
| 06 | `06-scanned-invoice.pdf` | PDF with no text layer → OCR fallback | `awaiting_review` |
| 07 | `07-blank-scan.png` | OCR recognises nothing, retry exhausted | `needs_manual_entry` |
| 08 | `08-corrupt-file.pdf` | File is not readable as a PDF | `needs_manual_entry` |

## What each one showed

**01 — clean digital receipt.** `pdf_extraction` succeeds and no OCR runs, so
the extraction is scored against the digital baseline of 98. Both checks pass:
line items 49.50 + 35.00 = the stated 84.50 subtotal, and 84.50 + 6.76 = the
stated 91.26 total. Six of eight fields land at 98; `processing_confidence` 100.

**02 — clean digital invoice.** Same route as 01 on a longer, denser invoice.
Included deliberately as the harder end of the digital case — see the note on
extraction quality below.

**03 — missing vendor.** The page carries no trading name at all, only an
`ACCOUNTS PAYABLE COPY` filing header. `vendor_name` comes back null and appears
in `missing_fields`, which forces that field's confidence to 0 and — since the
document score is the *minimum* across fields, not an average — the whole
document's `overall_confidence` to 0. That is the intended design: one unknown
required field means the document cannot be trusted wholesale.

**04 — mismatched totals.** The line items still sum to the stated subtotal, but
the printed total is wrong: 84.50 + 6.76 is 91.26, not the 99.99 on the page.
Exactly one check fails, and the cap lands precisely where it should:

```
subtotal_amount: 40   tax_amount: 40   total_amount: 40      <- capped from 98
document_number: 98   line_items: 98                          <- untouched
line_items_sum_matches_subtotal:  PASS (84.5 vs 84.5)
subtotal_plus_tax_matches_total:  FAIL (84.5 + 6.76 = 91.26 vs 99.99)
```

**05 — photographed receipt.** A JPEG, so OCR runs unconditionally. Recognition
lands at `ocr_quality_score` 83.87, and that figure discounts every field's
confidence (83.87 rather than the digital 98) — the OCR-quality factor working
as intended. `processing_confidence` 90, reflecting the OCR-fallback penalty.

**06 — scanned invoice.** A one-page PDF holding nothing but a JPEG. Its text
layer yields zero characters, so the quality score falls under the threshold and
the document is handed to OCR — visible in the logs as `pdf_extraction` followed
by `ocr`. Recognition scores 92.82.

**07 — blank scan.** OCR runs, recognises zero words, retries once, and gives
up. The document is moved to `needs_manual_entry` with
`OCR produced near-empty output after retry (0 word(s) recognized)`.
`processing_confidence` 75.

**08 — corrupt file.** Valid PDF header, garbage body. The parser rejects it
before any text or OCR step, and the document lands on `needs_manual_entry` with
`Failed to read PDF: Invalid PDF structure.` No draft row is created.

## A note on extraction quality

Reaching `awaiting_review` means the pipeline finished, not that every field was
found. With `llama3.2:1b` — the smallest model the project runs against — field
coverage varies by layout: the receipt-shaped documents (01, 03, 04) give up
their numbers readily, while the denser invoice (02) returned only the document
number and its line items, and no sample yielded `currency` at all.

That is the model's ceiling, not a pipeline fault, and it is exactly what the
confidence scoring exists to surface: the missing fields are listed in
`missing_fields`, scored 0, and the document is held for review rather than
being passed off as complete. A larger local model raises field coverage without
any code change — only `OLLAMA_MODEL` differs.

## Regenerating

These files are generated documents, not scans of real invoices, so they carry
no personal or commercial data. 01–04 are hand-built single-page PDFs with a
real text layer; 05 and 06 are the same kind of page rasterised (and, for 05,
tilted, softened and re-encoded as JPEG) so they have no text layer for the
pipeline to shortcut to.
