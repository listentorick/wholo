import { notFound } from 'next/navigation';
import { getDistributorForSlug } from '@/lib/server/get-distributor';
import { DistributorShell } from './DistributorShell';

export default async function DistributorLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ distributorSlug: string }>;
}) {
  const { distributorSlug } = await params;
  const distributor = await getDistributorForSlug(distributorSlug);

  // Resolving the slug here, before any child mounts, means a bad slug never
  // reaches the client shell (sidebar, providers) or a page's own data fetch
  // (products, orders, …) — it renders the sibling not-found.tsx instead.
  if (!distributor) notFound();

  return (
    <DistributorShell distributorSlug={distributorSlug} initialDistributor={distributor}>
      {children}
    </DistributorShell>
  );
}
