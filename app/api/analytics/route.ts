import { NextResponse } from 'next/server';
import { withApiErrorHandler } from '@/lib/api-error-handler';
import { getAnalytics } from '@/lib/analytics/metrics';

/** Live aggregates over the whole pipeline — never statically cache this response. */
export const dynamic = 'force-dynamic';

export const GET = withApiErrorHandler(async () => {
  const data = await getAnalytics();
  return NextResponse.json(data, { status: 200 });
});
