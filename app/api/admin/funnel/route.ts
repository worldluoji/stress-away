import { NextRequest, NextResponse } from 'next/server';
import { getReportFunnel } from '@/lib/usage-events';
import { requireAdmin } from '@/lib/user-auth';

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export async function GET() {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const funnel = await getReportFunnel();
    return NextResponse.json({
      funnel,
      rates: {
        confirmToView: rate(funnel.paywallConfirm.count, funnel.paywallView.count),
        generateToConfirm: rate(funnel.reportGenerate.count, funnel.paywallConfirm.count),
        downloadToGenerate: rate(funnel.reportDownload.count, funnel.reportGenerate.count),
      },
    });
  } catch (error) {
    console.error('[admin/funnel] failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
