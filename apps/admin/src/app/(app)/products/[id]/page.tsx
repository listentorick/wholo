'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { adminProductsApi } from '@wholo/admin-api-client';
import { Permission, ProductStatus, type Product } from '@wholo/types';
import { useAuth } from '@/lib/auth-context';
import { useCan } from '@/lib/permissions';
import { useQueryParamTab } from '@/lib/hooks/use-query-param-tab';
import { DetailPageHeader } from '@/components/detail/DetailPageHeader';
import { DetailPageLayout } from '@/components/detail/DetailPageLayout';
import { DetailActionsPanel, type ActionItem } from '@/components/detail/DetailActionsPanel';
import { DetailTabs } from '@/components/detail/DetailTabs';
import { StatusBadge, type StatusTone } from '@/components/list/StatusBadge';
import {
  PRICING_FIELDS,
  ProductDetailsFields,
  ProductPricingFields,
  ProductStatusCard,
  productDefaultValues,
  productSchema,
  toProductRequest,
  useProductMeta,
  type ProductFormValues,
} from '@/components/products/ProductForm';
import { AccountingLinkSection } from '@/components/integrations/record-link/AccountingLinkSection';
import { IntegrationsTab } from '@/components/integrations/record-link/IntegrationsTab';
import { LinkProblemPill } from '@/components/integrations/record-link/LinkProblemPill';
import { linkProblem, productLinkConfig } from '@/components/integrations/record-link/record-link-config';
import {
  resolveIntegrationsTab,
  useRecordAccountingLink,
} from '@/components/integrations/record-link/useRecordAccountingLink';
import { ListSpinner } from '@/components/list/ListSpinner';

const STATUS_META: Record<ProductStatus, { label: string; tone: StatusTone }> = {
  [ProductStatus.ACTIVE]: { label: 'Active', tone: 'green' },
  [ProductStatus.DRAFT]: { label: 'Draft', tone: 'yellow' },
  [ProductStatus.ARCHIVED]: { label: 'Archived', tone: 'gray' },
};

type TabKey = 'details' | 'pricing' | 'integrations';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'integrations', label: 'Integrations' },
];

const spinner = (
  <div className="flex h-screen items-center justify-center bg-canvas">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
  </div>
);

function ProductPageInner() {
  const { accessToken } = useAuth();
  const params = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchProduct = useCallback(() => {
    if (!accessToken || !params?.id) return;
    adminProductsApi
      .get(params.id)
      .then(setProduct)
      .catch(() => setFetchError('Product not found.'))
      .finally(() => setIsLoading(false));
  }, [accessToken, params?.id]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  if (isLoading) return spinner;

  if (fetchError || !product) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
        {fetchError ?? 'Product not found.'}
      </div>
    );
  }

  // Keyed so the form starts from the loaded product's values.
  return <ProductEditor key={product.id} product={product} onSaved={setProduct} />;
}

function ProductEditor({ product, onSaved }: { product: Product; onSaved: (product: Product) => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const meta = useProductMeta();
  const { activeTab: requestedTab, setTab } = useQueryParamTab<TabKey>('details');
  const canReadAccounting = useCan()(Permission.ACCOUNTING_READ);
  const {
    link: accountingLink,
    accounting,
    settled: accountingSettled,
    refresh: refreshAccountingLink,
  } = useRecordAccountingLink(
    productLinkConfig,
    product.id,
    canReadAccounting,
  );

  const [apiError, setApiError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // One form for the Details and Pricing tabs, so Save covers both.
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: productDefaultValues(product),
  });
  const { handleSubmit, reset, formState: { isSubmitting } } = form;

  const { showTab: showIntegrations, activeTab } = resolveIntegrationsTab(requestedTab, 'details', {
    accounting,
    settled: accountingSettled,
  });
  const visibleTabs = TABS.filter((t) => t.key !== 'integrations' || showIntegrations);

  async function onFormSubmit(data: ProductFormValues) {
    setApiError(null);
    setSaved(null);
    try {
      const updated = await adminProductsApi.update(product.id, toProductRequest(data));
      reset(productDefaultValues(updated));
      onSaved(updated);
      setSaved('Changes saved.');
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  // A failing field may be on the other tab — open the tab that shows it.
  function onInvalid(errors: FieldErrors<ProductFormValues>) {
    const fields = Object.keys(errors) as (keyof ProductFormValues)[];
    if (fields.length && fields.every((f) => PRICING_FIELDS.includes(f))) setTab('pricing');
    else if (fields.some((f) => !PRICING_FIELDS.includes(f) && f !== 'status')) setTab('details');
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await adminProductsApi.delete(product.id);
      router.push('/products');
    } catch {
      setIsDeleting(false);
    }
  }

  const disabled = isSubmitting || meta.loading;
  const statusMeta = STATUS_META[product.status];

  const actions: ActionItem[] = [
    {
      key: 'save',
      label: 'Save changes',
      tone: 'primary',
      type: 'submit',
      disabled,
      loading: isSubmitting,
      loadingLabel: 'Saving…',
    },
    { key: 'discard', label: 'Discard', href: '/products' },
    {
      key: 'delete',
      label: 'Delete product',
      tone: 'danger',
      dangerZone: true,
      loading: isDeleting,
      loadingLabel: 'Deleting…',
      onClick: handleDelete,
      confirm: { prompt: 'Are you sure? This cannot be undone.', confirmLabel: 'Yes, delete' },
    },
  ];

  return (
    <>
      <DetailPageHeader
        backHref="/products"
        backLabel="Products"
        heading={product.name}
        badge={
          <>
            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
            <LinkProblemPill
              problem={linkProblem(accountingLink, productLinkConfig.notLinked.tone)}
              onClick={() => setTab('integrations')}
            />
          </>
        }
      />

      <DetailTabs tabs={visibleTabs} activeKey={activeTab} onChange={setTab} />

      <form onSubmit={handleSubmit(onFormSubmit, onInvalid)} noValidate>
        <DetailPageLayout
          sidebar={
            <>
              <DetailActionsPanel layout="sidebar" actions={actions} banner={{ success: saved, error: apiError }} />
              <ProductStatusCard form={form} disabled={disabled} />
            </>
          }
        >
          {activeTab === 'details' && (
            <ProductDetailsFields form={form} meta={meta} disabled={disabled} productId={product.id} />
          )}
          {activeTab === 'pricing' && (
            <ProductPricingFields
              form={form}
              meta={meta}
              disabled={disabled}
              productId={product.id}
              currencyCode={user?.organisationCurrencyCode ?? 'GBP'}
            />
          )}
          {activeTab === 'integrations' && !accounting && <ListSpinner />}
          {activeTab === 'integrations' && accounting && (
            <IntegrationsTab>
              <AccountingLinkSection
                config={productLinkConfig}
                link={accounting}
                matchTargetId={product.id}
                record={{
                  displayName: product.name,
                  rows: [
                    { label: 'Code', value: product.sku },
                    { label: 'Sale price', value: product.price },
                    { label: 'Tax code', value: product.taxType?.name ?? null },
                  ],
                }}
                onChanged={async () => {
                  await refreshAccountingLink();
                  // Linking can set the product's tax type, so reload the product
                  // too — best-effort: the link itself has already been made.
                  try {
                    const latest = await adminProductsApi.get(product.id);
                    reset(productDefaultValues(latest), { keepDirtyValues: true });
                    onSaved(latest);
                  } catch {
                    // Keep the product as shown; the next load picks up the change.
                  }
                }}
              />
            </IntegrationsTab>
          )}
        </DetailPageLayout>
      </form>
    </>
  );
}

export default function ProductPage() {
  return (
    <Suspense fallback={spinner}>
      <ProductPageInner />
    </Suspense>
  );
}
