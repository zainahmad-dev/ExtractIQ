import { NextResponse } from 'next/server';
import { withApiErrorHandler } from '@/lib/api-error-handler';
import { getDashboardStats } from '@/lib/dashboard/stats';

/** Live operational counts — never statically cache this response. */
export const dynamic = 'force-dynamic';

export const GET = withApiErrorHandler(async () => {
  const data = await getDashboardStats();
  return NextResponse.json(data, { status: 200 });
});
