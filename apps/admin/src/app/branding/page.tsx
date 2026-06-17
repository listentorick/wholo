'use client';

import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { FormCard } from '@/components/settings/shared';
import { BrandingLogoUploader } from '@/components/branding/BrandingLogoUploader';
import { BrandingBannerUploader } from '@/components/branding/BrandingBannerUploader';

export default function BrandingPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken, user } = useAuth();

  if (authLoading || !accessToken || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <AdminLayout>
      <h1 className="mb-6 text-xl font-semibold text-text">Branding</h1>

      <div className="space-y-5">
        <FormCard
          title="Logo"
          description="Shown as a circle in the portal header and banner. Square images work best."
        >
          <BrandingLogoUploader token={accessToken} distributorId={user.organisationId} />
        </FormCard>

        <FormCard
          title="Banner"
          description="Full-width image at the top of your portal home page. Recommended size: 1920×480px."
        >
          <BrandingBannerUploader token={accessToken} distributorId={user.organisationId} />
        </FormCard>
      </div>
    </AdminLayout>
  );
}
