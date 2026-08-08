import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // pdf-parse (and its pdfjs-dist dependency), tesseract.js, and sharp all do
  // environment/module-system detection or use native bindings/workers that
  // webpack's server bundling breaks — keep them external so Node's own
  // require() loads them instead.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'tesseract.js', 'sharp'],
};

export default nextConfig;
