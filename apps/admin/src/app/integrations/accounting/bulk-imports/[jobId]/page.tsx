'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { adminAccountingApi } from '@wholo/admin-api-client';
import type { AccountingBulkImportJob } from '@wholo/types';

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-canvas">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

const STAT_LABELS: { key: keyof AccountingBulkImportJob; label: string }[] = [
  { key: 'importedCount', label: 'Imported' },
  { key: 'matchedCount', label: 'Matched' },
  { key: 'skippedCount', label: 'Skipped' },
  { key: 'failedCount', label: 'Failed' },
];

function BulkImportReportInner() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();
  const params = useParams();
  const jobId = params.jobId as string;
  const searchParams = useSearchParams();
  const recordType = searchParams.get('type') === 'contacts' ? 'contacts' : 'products';

  const [job, setJob] = useState<AccountingBulkImportJob | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const fetchJob = recordType === 'contacts' ? adminAccountingApi.getContactBulkImportJob : adminAccountingApi.getProductBulkImportJob;
    fetchJob(jobId, accessToken)
      .then(setJob)
      .catch(() => {
        setError('Failed to load the import report. Please refresh.');
        setJob(null);
      });
  }, [accessToken, jobId, recordType]);

  if (authLoading || job === undefined) {
    return <Spinner />;
  }

  const backHref = `/integrations/accounting?tab=${recordType}`;

  return (
    <AdminLayout>
      <div className="mb-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors mb-3"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to {recordType}
        </Link>
        <h1 className="text-xl font-semibold text-text">Bulk import report</h1>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      ) : !job ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          Import job not found.
        </div>
      ) : (
        <>
          {(job.status === 'QUEUED' || job.status === 'PROCESSING') && (
            <div className="mb-4 rounded-lg border border-border bg-surface px-5 py-4 text-sm text-text">
              Import still in progress ({job.importedCount + job.matchedCount + job.skippedCount + job.failedCount} of{' '}
              {job.totalCount || '…'} processed so far). Refresh to see the latest progress.
            </div>
          )}
          {job.status === 'FAILED' && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              This bulk import failed before completing.
            </div>
          )}

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STAT_LABELS.map(({ key, label }) => (
              <div key={key} className="rounded-lg border border-border bg-white p-4">
                <p className="text-2xl font-semibold text-text">{job[key] as number}</p>
                <p className="text-xs text-muted">{label}</p>
              </div>
            ))}
          </div>

          {job.results.filter((r) => r.outcome === 'failed' || r.outcome === 'skipped').length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border bg-white">
              <table className="w-full text-left">
                <thead className="border-b border-border bg-[#fafafa]">
                  <tr>
                    <th className="py-3 pl-5 pr-4 text-xs font-medium text-muted">Item</th>
                    <th className="py-3 px-4 text-xs font-medium text-muted">Outcome</th>
                    <th className="py-3 pl-4 pr-5 text-xs font-medium text-muted">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {job.results
                    .filter((r) => r.outcome === 'failed' || r.outcome === 'skipped')
                    .map((r) => (
                      <tr key={r.externalId} className="border-b border-border last:border-0">
                        <td className="py-3 pl-5 pr-4 text-sm font-medium text-text">{r.displayName}</td>
                        <td className="py-3 px-4 text-sm text-muted capitalize">{r.outcome}</td>
                        <td className="py-3 pl-4 pr-5 text-sm text-muted">{r.error ?? '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}

export default function BulkImportReportPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <BulkImportReportInner />
    </Suspense>
  );
}
