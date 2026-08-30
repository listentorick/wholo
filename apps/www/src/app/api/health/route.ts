import { NextResponse } from 'next/server';

// Liveness/readiness probe target for the k8s Deployment. Static, no deps.
export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json({ status: 'ok' });
}
