import Link from 'next/link';
import { FileText, ScanLine, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';

/**
 * The CTAs are links, not Buttons: a <button> can't legally nest inside an
 * anchor, and these are navigations. They mirror Button's primary/outline
 * "lg" styling so the landing page still reads as part of the design system.
 */
const CTA_BASE =
  'inline-flex h-12 items-center justify-center rounded-control px-6 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

const CAPABILITIES = [
  {
    icon: ScanLine,
    title: 'Extract',
    description:
      'Digital PDFs are read directly; scans and photos fall back to OCR, so anything you upload gets text.',
  },
  {
    icon: FileText,
    title: 'Structure',
    description:
      'A local LLM turns that text into schema-valid fields and line items — vendor, dates, totals, the lot.',
  },
  {
    icon: ShieldCheck,
    title: 'Verify',
    description:
      'Every field carries a confidence score backed by arithmetic checks, so review time goes where it matters.',
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col gap-10 p-6 sm:p-10">
      <section className="flex max-w-3xl flex-col gap-5">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Turn documents into structured data.
        </h1>
        <p className="text-lg text-muted-foreground">
          ExtractIQ ingests invoices and receipts, extracts their fields with OCR and a local LLM,
          and scores how much you should trust each one — so a human only reviews what actually
          needs it.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/upload"
            className={`${CTA_BASE} bg-primary text-foreground hover:bg-primary/90`}
          >
            Upload a document
          </Link>
          <Link
            href="/dashboard"
            className={`${CTA_BASE} border border-surface-elevated text-foreground hover:bg-surface`}
          >
            View dashboard
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {CAPABILITIES.map(({ icon: Icon, title, description }) => (
          <Card key={title} className="flex flex-col gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-control bg-primary/15 text-primary">
              <Icon size={20} />
            </span>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
