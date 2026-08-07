import sharp from 'sharp';

export interface PreprocessOptions {
  grayscale?: boolean;
  contrast?: boolean;
  deskew?: boolean;
  denoise?: boolean;
}

export const DEFAULT_PREPROCESS_OPTIONS: Required<PreprocessOptions> = {
  grayscale: true,
  contrast: true,
  deskew: true,
  denoise: true,
};

export interface PreprocessResult {
  buffer: Buffer;
  appliedSteps: string[];
  skewAngle: number;
}

/** Widest the image is downscaled to while estimating skew. */
const SKEW_ANALYSIS_WIDTH = 500;
/** Skew is searched within +/- this many degrees. */
const MAX_SKEW_DEGREES = 10;
const SKEW_STEP_DEGREES = 0.25;
/** Below this, rotating would cost more in resampling blur than it corrects. */
const MIN_CORRECTABLE_SKEW = 0.3;

/**
 * Otsu's method: pick the threshold that maximises between-class variance of
 * the intensity histogram, separating ink from paper without a hardcoded cutoff.
 */
function otsuThreshold(pixels: Buffer): number {
  const histogram = new Array<number>(256).fill(0);
  for (const value of pixels) {
    histogram[value] += 1;
  }

  const total = pixels.length;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) {
    sum += i * histogram[i];
  }

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = -1;
  let threshold = 127;

  for (let t = 0; t < 256; t += 1) {
    weightBackground += histogram[t];
    if (weightBackground === 0) continue;

    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += t * histogram[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }

  return threshold;
}

/**
 * Estimates page skew with the projection-profile method: shear the ink mask by
 * a candidate angle, sum ink per row, and score the profile by its sum of
 * squares. When lines of text are level, ink concentrates into a few dense rows
 * and that score peaks.
 */
export async function detectSkewAngle(image: Buffer): Promise<number> {
  const { data, info } = await sharp(image)
    .grayscale()
    .resize({ width: SKEW_ANALYSIS_WIDTH, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  if (width < 2 || height < 2) return 0;

  const threshold = otsuThreshold(data);

  // Collect ink pixel coordinates once; scoring then only walks this list.
  const inkX: number[] = [];
  const inkY: number[] = [];
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      if (data[rowOffset + x] < threshold) {
        inkX.push(x);
        inkY.push(y);
      }
    }
  }

  // An essentially blank or entirely black page carries no usable skew signal.
  const inkRatio = inkX.length / (width * height);
  if (inkX.length === 0 || inkRatio > 0.9) return 0;

  const centerX = width / 2;
  let bestAngle = 0;
  let bestScore = -1;

  for (let angle = -MAX_SKEW_DEGREES; angle <= MAX_SKEW_DEGREES; angle += SKEW_STEP_DEGREES) {
    const slope = Math.tan((angle * Math.PI) / 180);
    const profile = new Float64Array(height);

    for (let i = 0; i < inkX.length; i += 1) {
      const row = Math.round(inkY[i] - (inkX[i] - centerX) * slope);
      if (row >= 0 && row < height) {
        profile[row] += 1;
      }
    }

    let score = 0;
    for (let row = 0; row < height; row += 1) {
      score += profile[row] * profile[row];
    }

    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }

  return Math.abs(bestAngle) < MIN_CORRECTABLE_SKEW ? 0 : bestAngle;
}

/**
 * Estimates the page's own background tone as the dominant value among the
 * brighter half of the histogram — on a document scan that is the paper itself.
 */
async function estimatePaperTone(image: Buffer): Promise<number> {
  const { data } = await sharp(image).grayscale().raw().toBuffer({ resolveWithObject: true });

  const histogram = new Array<number>(256).fill(0);
  for (const value of data) {
    histogram[value] += 1;
  }

  let mode = 255;
  let highestCount = -1;
  for (let value = 128; value < 256; value += 1) {
    if (histogram[value] > highestCount) {
      highestCount = histogram[value];
      mode = value;
    }
  }

  return mode;
}

/**
 * Prepares a scanned or photographed page for OCR. Every step is independently
 * toggleable; skipping all of them returns the original bytes untouched.
 */
export async function preprocessImage(
  image: Buffer,
  options: PreprocessOptions = {}
): Promise<PreprocessResult> {
  const settings = { ...DEFAULT_PREPROCESS_OPTIONS, ...options };
  const appliedSteps: string[] = [];

  let pipeline = sharp(image);
  let skewAngle = 0;

  if (settings.grayscale) {
    pipeline = pipeline.grayscale();
    appliedSteps.push('grayscale');
  }

  if (settings.contrast) {
    // Histogram stretch: pushes faded scans back to full black-to-white range.
    pipeline = pipeline.normalise();
    appliedSteps.push('contrast');
  }

  if (settings.denoise) {
    // Median filtering clears scanner speckle without softening glyph edges
    // the way a blur would.
    pipeline = pipeline.median(3);
    appliedSteps.push('denoise');
  }

  if (settings.deskew) {
    // Detected on the partially-processed image so contrast/denoise gains
    // sharpen the estimate, then corrected by rotating the opposite way.
    const intermediate = await pipeline.toBuffer();
    skewAngle = await detectSkewAngle(intermediate);
    pipeline = sharp(intermediate);
    if (skewAngle !== 0) {
      // Rotation exposes new corner wedges. Filling them with plain white
      // would give a dim page two dominant tones — paper and pure-white
      // wedge — and Tesseract's global binarisation then splits on *that*
      // boundary, flattening the real text away entirely. Filling with the
      // page's own paper tone keeps the histogram single-moded so the
      // threshold still lands between ink and paper.
      const paperTone = await estimatePaperTone(intermediate);
      pipeline = pipeline.rotate(-skewAngle, {
        background: { r: paperTone, g: paperTone, b: paperTone },
      });
    }
    appliedSteps.push('deskew');
  }

  const buffer = await pipeline.png().toBuffer();
  return { buffer, appliedSteps, skewAngle };
}
