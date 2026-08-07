import { createWorker, type Worker } from 'tesseract.js';
import { PDFParse } from 'pdf-parse';
import { withRetry, handleRetryExhaustion } from '@/lib/validation/retry';
import { preprocessImage, type PreprocessOptions } from './preprocess';

const OCR_LANGUAGE = 'eng';
/** Render PDF pages at 2x so small print survives rasterisation. */
const PDF_RENDER_SCALE = 2;
/** Below this, OCR output is treated as a failed attempt worth retrying. */
const MIN_ACCEPTABLE_WORD_COUNT = 2;

export interface OcrPageResult {
  pageNumber: number;
  text: string;
  ocrQualityScore: number;
  wordCount: number;
  skewAngle: number;
}

export interface OcrResult {
  text: string;
  ocrQualityScore: number;
  wordCount: number;
  pages: OcrPageResult[];
  appliedSteps: string[];
}

let workerPromise: Promise<Worker> | null = null;

/**
 * Returns the shared Tesseract worker, creating it on first use. Spinning up a
 * worker loads the language model, so a single instance is reused across every
 * call; the promise itself is cached so concurrent callers can't race into
 * building two.
 */
export function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker(OCR_LANGUAGE).catch((error: unknown) => {
      // Don't cache a failed startup — the next call should retry cleanly.
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

/** Shuts down the shared worker. Call on process teardown. */
export async function terminateOcrWorker(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise.catch(() => null);
  workerPromise = null;
  if (worker) {
    await worker.terminate();
  }
}

/**
 * Averages per-word Tesseract confidence into a single 0-100 score. Tesseract
 * reports confidence per word, so empty whitespace tokens are ignored rather
 * than dragging the average down.
 */
function averageWordConfidence(
  blocks: NonNullable<Awaited<ReturnType<Worker['recognize']>>['data']['blocks']>
) {
  let total = 0;
  let count = 0;

  for (const block of blocks) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        for (const word of line.words) {
          if (word.text.trim().length === 0) continue;
          total += word.confidence;
          count += 1;
        }
      }
    }
  }

  return { ocrQualityScore: count > 0 ? total / count : 0, wordCount: count };
}

/**
 * Runs OCR over a single already-rasterised image (a photographed receipt, a
 * PNG/JPG upload, or one rendered PDF page).
 */
export async function extractTextFromImage(
  image: Buffer,
  options: PreprocessOptions = {}
): Promise<OcrResult> {
  const { buffer, appliedSteps, skewAngle } = await preprocessImage(image, options);

  const worker = await getOcrWorker();
  const { data } = await worker.recognize(buffer, {}, { text: true, blocks: true });

  const { ocrQualityScore, wordCount } = averageWordConfidence(data.blocks ?? []);
  const text = data.text.trim();

  return {
    text,
    ocrQualityScore,
    wordCount,
    appliedSteps,
    pages: [{ pageNumber: 1, text, ocrQualityScore, wordCount, skewAngle }],
  };
}

/**
 * Rasterises each page of a scanned PDF and OCRs the resulting images. PDFs
 * carry no pixels Tesseract can read directly, so the render step is required
 * before any recognition happens.
 */
export async function extractTextFromPdf(
  pdf: Buffer,
  options: PreprocessOptions = {}
): Promise<OcrResult> {
  const parser = new PDFParse({ data: pdf });

  let renderedPages: { pageNumber: number; data: Uint8Array }[];
  try {
    const screenshots = await parser.getScreenshot({
      scale: PDF_RENDER_SCALE,
      imageBuffer: true,
      imageDataUrl: false,
    });
    renderedPages = screenshots.pages.map((page) => ({
      pageNumber: page.pageNumber,
      data: page.data,
    }));
  } finally {
    await parser.destroy();
  }

  const pages: OcrPageResult[] = [];
  const appliedSteps: string[] = [];
  let weightedConfidence = 0;
  let totalWords = 0;

  for (const rendered of renderedPages) {
    const pageResult = await extractTextFromImage(Buffer.from(rendered.data), options);
    if (appliedSteps.length === 0) {
      appliedSteps.push(...pageResult.appliedSteps);
    }

    pages.push({
      pageNumber: rendered.pageNumber,
      text: pageResult.text,
      ocrQualityScore: pageResult.ocrQualityScore,
      wordCount: pageResult.wordCount,
      skewAngle: pageResult.pages[0].skewAngle,
    });

    weightedConfidence += pageResult.ocrQualityScore * pageResult.wordCount;
    totalWords += pageResult.wordCount;
  }

  return {
    text: pages
      .map((page) => page.text)
      .join('\n')
      .trim(),
    // Weighted by word count so a sparse page can't skew the document score.
    ocrQualityScore: totalWords > 0 ? weightedConfidence / totalWords : 0,
    wordCount: totalWords,
    pages,
    appliedSteps,
  };
}

/**
 * extractTextFromImage, retried once on near-empty output. On exhaustion,
 * records documents.status = 'needs_manual_entry' + error_reason directly
 * (Phase 18 formalizes this through the shared state machine) and returns
 * the last attempt's result so the caller still has whatever text, if any,
 * was recovered.
 */
export async function extractTextFromImageWithRetry(
  documentId: string,
  image: Buffer,
  options: PreprocessOptions = {}
): Promise<OcrResult> {
  let lastResult: OcrResult | undefined;

  try {
    return await withRetry(
      async () => {
        const result = await extractTextFromImage(image, options);
        lastResult = result;
        if (result.wordCount < MIN_ACCEPTABLE_WORD_COUNT) {
          throw new Error(
            `OCR produced near-empty output (${result.wordCount} word(s) recognized)`
          );
        }
        return result;
      },
      { retries: 1 }
    );
  } catch {
    await handleRetryExhaustion(
      documentId,
      `OCR produced near-empty output after retry (${lastResult?.wordCount ?? 0} word(s) recognized)`
    );
    return lastResult!;
  }
}

/**
 * extractTextFromPdf, retried once on near-empty output. Same exhaustion
 * handling as extractTextFromImageWithRetry.
 */
export async function extractTextFromPdfWithRetry(
  documentId: string,
  pdf: Buffer,
  options: PreprocessOptions = {}
): Promise<OcrResult> {
  let lastResult: OcrResult | undefined;

  try {
    return await withRetry(
      async () => {
        const result = await extractTextFromPdf(pdf, options);
        lastResult = result;
        if (result.wordCount < MIN_ACCEPTABLE_WORD_COUNT) {
          throw new Error(
            `OCR produced near-empty output (${result.wordCount} word(s) recognized)`
          );
        }
        return result;
      },
      { retries: 1 }
    );
  } catch {
    await handleRetryExhaustion(
      documentId,
      `OCR produced near-empty output after retry (${lastResult?.wordCount ?? 0} word(s) recognized)`
    );
    return lastResult!;
  }
}
