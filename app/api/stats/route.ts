import { NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/dashboard/stats';

/** Live operational counts — never statically cache this response. */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getDashboardStats();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
