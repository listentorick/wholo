'use client';

import { useSearchParams } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { useDistributor } from '@/lib/distributor-context';

export default function OrderAsEndedPage() {
  const searchParams = useSearchParams();
  const customerName = searchParams.get('customer') ?? 'the customer';
  const { distributor } = useDistributor();
  const distributorName = distributor?.name ?? 'your distributor';

  return (
    <PageShell center className="gap-6 px-8 text-center">
      <div className="flex max-w-md flex-col gap-2.5">
        <h1 className="text-lg font-semibold text-foreground">
          You&rsquo;ve ended your &ldquo;Order on behalf of {customerName}&rdquo; session
        </h1>
        <p className="text-sm text-muted">
          Any orders you placed will appear in the Stocdup Admin console for {distributorName}.
        </p>
      </div>
      <button
        onClick={() => window.close()}
        className="rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
      >
        Close this tab
      </button>
    </PageShell>
  );
}
