'use client';

import { FormCard } from '../shared';
import { BrandingLogoUploader } from '@/components/branding/BrandingLogoUploader';
import { BrandingBannerUploader } from '@/components/branding/BrandingBannerUploader';

interface Props {
  token: string;
  distributorId: string;
}

export function BrandingTab({ token, distributorId }: Props) {
  return (
    <div className="space-y-5">
      <FormCard
        title="Logo"
        description="Shown as a circle in the portal header and banner. Square images work best."
      >
        <BrandingLogoUploader token={token} distributorId={distributorId} />
      </FormCard>

      <FormCard
        title="Banner"
        description="Full-width image at the top of your portal home page. Recommended size: 1920×480px."
      >
        <BrandingBannerUploader token={token} distributorId={distributorId} />
      </FormCard>
    </div>
  );
}
