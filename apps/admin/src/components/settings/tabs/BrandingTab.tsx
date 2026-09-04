'use client';

import { FormCard } from '@/components/form';
import { WizardSectionHeading } from '@/components/customers/tabs/form-helpers';
import { BrandingLogoUploader } from '@/components/branding/BrandingLogoUploader';
import { BrandingBannerUploader } from '@/components/branding/BrandingBannerUploader';
import { WizardStepFooter } from '../../onboarding/WizardStepFooter';

interface Props {
  distributorId: string;
  /** 'wizard' embeds this as an onboarding step. Uploads apply instantly, so Next never blocks. */
  mode?: 'tab' | 'wizard';
  onNext?: () => void;
  onBack?: () => void;
}

export function BrandingTab({ distributorId, mode = 'tab', onNext, onBack }: Props) {
  if (mode === 'wizard') {
    return (
      <div>
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-text">Make it yours</h2>
        </div>
        <div className="space-y-5 p-5">
          <div>
            <WizardSectionHeading>Logo</WizardSectionHeading>
            <BrandingLogoUploader distributorId={distributorId} />
          </div>
          <div>
            <WizardSectionHeading>Banner</WizardSectionHeading>
            <BrandingBannerUploader distributorId={distributorId} />
          </div>
        </div>
        <WizardStepFooter onBack={onBack} onNext={onNext} nextLabel="Continue" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <FormCard
        title="Logo"
        description="Shown as a circle in the portal header and banner. Square images work best."
      >
        <BrandingLogoUploader distributorId={distributorId} />
      </FormCard>

      <FormCard
        title="Banner"
        description="Full-width image at the top of your portal home page. Recommended size: 1920×480px."
      >
        <BrandingBannerUploader distributorId={distributorId} />
      </FormCard>
    </div>
  );
}
