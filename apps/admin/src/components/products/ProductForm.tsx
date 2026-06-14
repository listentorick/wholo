'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { ProductStatus, PriceListRuleSelectorType, PriceListRuleValueType, PriceListRuleDiscountBaseType } from '@wholo/types';
import type { ProductType, Supplier, Product, CreateProductRequest, ProductPricingEntry, PriceListSummary } from '@wholo/types';
import { adminProductTypesApi, adminSuppliersApi, adminPriceListsApi } from '@wholo/admin-api-client';

// ─── Schema ──────────────────────────────────────────────────────────────────

const priceField = z
  .string()
  .optional()
  .refine(
    (val) => !val || (/^\d+(\.\d{0,2})?$/.test(val) && parseFloat(val) >= 0),
    'Enter a valid price (e.g. 12.99)',
  );

const schema = z.object({
  name: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  sku: z.string().optional(),
  status: z.nativeEnum(ProductStatus),
  productTypeId: z.string().optional(),
  supplierId: z.string().optional(),
  price: priceField,
  compareAtPrice: priceField,
});

type FormValues = z.infer<typeof schema>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: ProductStatus; label: string; color: string }[] = [
  { value: ProductStatus.ACTIVE, label: 'Active', color: '#16a34a' },
  { value: ProductStatus.DRAFT, label: 'Draft', color: '#d97706' },
  { value: ProductStatus.ARCHIVED, label: 'Archived', color: '#6b7280' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function FormCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-white">
      {title && (
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-text">{title}</h2>
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5"
    >
      {children}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-red-500">{message}</p>;
}

function TextInput({
  id,
  placeholder,
  disabled,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      id={id}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text placeholder-muted/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    />
  );
}

function SelectInput({
  id,
  disabled,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      id={id}
      disabled={disabled}
      className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
        paddingRight: '30px',
      }}
      {...props}
    >
      {children}
    </select>
  );
}

// ─── Product pricing table ────────────────────────────────────────────────────

const inputCls = 'rounded border border-border bg-white px-2 py-1.5 text-xs text-text outline-none focus:border-primary disabled:opacity-50';

function PricingDiscountInput({
  pct, setPct, discountBase, setDiscountBase, basePriceListId, setBasePriceListId,
  priceLists, excludePriceListId, disabled,
}: {
  pct: string; setPct: (v: string) => void;
  discountBase: PriceListRuleDiscountBaseType; setDiscountBase: (v: PriceListRuleDiscountBaseType) => void;
  basePriceListId: string; setBasePriceListId: (v: string) => void;
  priceLists: PriceListSummary[]; excludePriceListId?: string; disabled: boolean;
}) {
  const available = priceLists.filter((p) => p.active && p.id !== excludePriceListId);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <input type="text" inputMode="decimal" placeholder="0" value={pct}
        onChange={(e) => setPct(e.target.value)}
        className={`${inputCls} w-14 text-center`} disabled={disabled} />
      <span className="text-xs text-muted">% off</span>
      <select value={discountBase} onChange={(e) => setDiscountBase(e.target.value as PriceListRuleDiscountBaseType)}
        disabled={disabled} className={`${inputCls} pr-1`}>
        <option value={PriceListRuleDiscountBaseType.PRODUCT_PRICE}>Product price</option>
        <option value={PriceListRuleDiscountBaseType.PRICE_LIST}>Another price list</option>
      </select>
      {discountBase === PriceListRuleDiscountBaseType.PRICE_LIST && (
        <select value={basePriceListId} onChange={(e) => setBasePriceListId(e.target.value)}
          disabled={disabled} className={`${inputCls} max-w-[120px]`}>
          <option value="">Select list…</option>
          {available.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
        </select>
      )}
    </div>
  );
}

interface NewPricingRowProps {
  priceLists: PriceListSummary[];
  productId: string;
  onSave: (entry: ProductPricingEntry) => void;
  onCancel: () => void;
  token: string;
}

function NewPricingRow({ priceLists, productId, onSave, onCancel, token }: NewPricingRowProps) {
  const [priceListId, setPriceListId] = useState(priceLists[0]?.id ?? '');
  const [minQuantity, setMinQuantity] = useState('1');
  const [valueType, setValueType] = useState<PriceListRuleValueType>(PriceListRuleValueType.FIXED_PRICE);
  const [unitPrice, setUnitPrice] = useState('');
  const [pct, setPct] = useState('');
  const [discountBase, setDiscountBase] = useState<PriceListRuleDiscountBaseType>(PriceListRuleDiscountBaseType.PRODUCT_PRICE);
  const [basePriceListId, setBasePriceListId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const qty = parseInt(minQuantity, 10);
    if (!priceListId) { setError('Select a price list.'); return; }
    if (isNaN(qty) || qty < 1) { setError('Min quantity must be at least 1.'); return; }
    if (valueType === PriceListRuleValueType.FIXED_PRICE) {
      if (!unitPrice || isNaN(parseFloat(unitPrice))) { setError('Enter a valid price.'); return; }
    } else {
      if (!pct || isNaN(parseFloat(pct))) { setError('Enter a valid discount percentage.'); return; }
      if (discountBase === PriceListRuleDiscountBaseType.PRICE_LIST && !basePriceListId) {
        setError('Select a base price list.'); return;
      }
    }
    setError(null);
    setSaving(true);
    try {
      const rule = await adminPriceListsApi.createRule(token, priceListId, {
        selectorType: PriceListRuleSelectorType.PRODUCT,
        productId,
        minQuantity: qty,
        valueType,
        ...(valueType === PriceListRuleValueType.FIXED_PRICE
          ? { unitPrice: parseFloat(unitPrice).toFixed(2) }
          : {
              discountPercentage: parseFloat(pct).toFixed(2),
              discountBaseType: discountBase,
              basePriceListId: discountBase === PriceListRuleDiscountBaseType.PRICE_LIST ? basePriceListId : undefined,
            }),
      });
      const pl = priceLists.find((p) => p.id === priceListId);
      onSave({ priceListId, priceListName: pl?.name ?? priceListId, currency: pl?.currency ?? 'GBP', rule });
    } catch {
      setError('Failed to save. Please try again.');
      setSaving(false);
    }
  }

  return (
    <tr className="border-b border-border bg-[#fffbf7]">
      <td className="py-2 pl-4 pr-2">
        <select value={priceListId} onChange={(e) => setPriceListId(e.target.value)}
          className={`${inputCls} w-full`} disabled={saving}>
          {priceLists.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
        </select>
      </td>
      <td className="py-2 px-2">
        <input type="number" min={1} value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)}
          className={`${inputCls} w-16`} disabled={saving} />
      </td>
      <td className="py-2 px-2">
        <select value={valueType} onChange={(e) => setValueType(e.target.value as PriceListRuleValueType)}
          disabled={saving} className={`${inputCls} pr-1`}>
          <option value={PriceListRuleValueType.FIXED_PRICE}>Fixed price</option>
          <option value={PriceListRuleValueType.PERCENTAGE_DISCOUNT}>% Discount</option>
        </select>
      </td>
      <td className="py-2 px-2">
        {valueType === PriceListRuleValueType.FIXED_PRICE ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted">£</span>
            <input type="text" inputMode="decimal" placeholder="0.00" value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)} className={`${inputCls} w-24`} disabled={saving} />
          </div>
        ) : (
          <PricingDiscountInput
            pct={pct} setPct={setPct} discountBase={discountBase} setDiscountBase={setDiscountBase}
            basePriceListId={basePriceListId} setBasePriceListId={setBasePriceListId}
            priceLists={priceLists} excludePriceListId={priceListId} disabled={saving}
          />
        )}
      </td>
      <td className="py-2 px-2">
        <span className="text-xs text-muted">Active on save</span>
      </td>
      <td className="py-2 pl-2 pr-4">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={handleSave} disabled={saving}
            className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onCancel} disabled={saving}
            className="rounded border border-border px-2.5 py-1 text-xs font-medium text-text hover:bg-border/20 disabled:opacity-50">
            Cancel
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </td>
    </tr>
  );
}

interface PricingEntryRowProps {
  entry: ProductPricingEntry;
  priceLists: PriceListSummary[];
  onUpdate: (entry: ProductPricingEntry) => void;
  token: string;
}

function PricingEntryRow({ entry, priceLists, onUpdate, token }: PricingEntryRowProps) {
  const rule = entry.rule;
  const isDiscount = rule.valueType === PriceListRuleValueType.PERCENTAGE_DISCOUNT;
  const [editing, setEditing] = useState(false);
  const [minQuantity, setMinQuantity] = useState(String(rule.minQuantity));
  const [unitPrice, setUnitPrice] = useState(rule.unitPrice ?? '');
  const [pct, setPct] = useState(rule.discountPercentage ?? '');
  const [discountBase, setDiscountBase] = useState<PriceListRuleDiscountBaseType>(
    rule.discountBaseType ?? PriceListRuleDiscountBaseType.PRODUCT_PRICE,
  );
  const [basePriceListId, setBasePriceListId] = useState(rule.basePriceListId ?? '');
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function handleSave() {
    const qty = parseInt(minQuantity, 10);
    if (isNaN(qty) || qty < 1) return;
    setSaving(true);
    try {
      const updated = await adminPriceListsApi.updateRule(token, entry.priceListId, rule.id, {
        minQuantity: qty,
        ...(isDiscount
          ? {
              discountPercentage: parseFloat(pct).toFixed(2),
              discountBaseType: discountBase,
              basePriceListId: discountBase === PriceListRuleDiscountBaseType.PRICE_LIST ? basePriceListId : undefined,
            }
          : { unitPrice: parseFloat(unitPrice).toFixed(2) }),
      });
      onUpdate({ ...entry, rule: updated });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEditing(false);
    setMinQuantity(String(rule.minQuantity));
    setUnitPrice(rule.unitPrice ?? '');
    setPct(rule.discountPercentage ?? '');
    setDiscountBase(rule.discountBaseType ?? PriceListRuleDiscountBaseType.PRODUCT_PRICE);
    setBasePriceListId(rule.basePriceListId ?? '');
  }

  async function handleToggle() {
    setToggling(true);
    try {
      const updated = await adminPriceListsApi.updateRule(token, entry.priceListId, rule.id, { active: !rule.active });
      onUpdate({ ...entry, rule: updated });
    } finally {
      setToggling(false);
    }
  }

  const basePriceListName = priceLists.find((p) => p.id === rule.basePriceListId)?.name;

  return (
    <tr className={['border-b border-border last:border-0 transition-colors', !rule.active ? 'opacity-50' : ''].join(' ')}>
      <td className="py-2.5 pl-4 pr-2 text-sm text-text">{entry.priceListName}</td>
      <td className="py-2.5 px-2">
        {editing ? (
          <input type="number" min={1} value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)}
            className={`${inputCls} w-16`} disabled={saving} />
        ) : (
          <span className="text-sm text-text">{rule.minQuantity}</span>
        )}
      </td>
      <td className="py-2.5 px-2">
        {isDiscount ? (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[#eff6ff] text-[#1d4ed8]">
            % Discount
          </span>
        ) : (
          <span className="text-sm text-text">Fixed</span>
        )}
      </td>
      <td className="py-2.5 px-2">
        {editing ? (
          isDiscount ? (
            <PricingDiscountInput
              pct={pct} setPct={setPct} discountBase={discountBase} setDiscountBase={setDiscountBase}
              basePriceListId={basePriceListId} setBasePriceListId={setBasePriceListId}
              priceLists={priceLists} excludePriceListId={entry.priceListId} disabled={saving}
            />
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted">£</span>
              <input type="text" inputMode="decimal" value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)} className={`${inputCls} w-24`} disabled={saving} />
            </div>
          )
        ) : isDiscount ? (
          <span className="text-sm text-text">
            {rule.discountPercentage}%{' '}
            <span className="text-muted">off{' '}</span>
            {rule.discountBaseType === PriceListRuleDiscountBaseType.PRODUCT_PRICE
              ? <span className="text-muted">product price</span>
              : <span>{basePriceListName ?? rule.basePriceListId}</span>
            }
          </span>
        ) : (
          <span className="font-mono text-sm text-text">{entry.currency} {rule.unitPrice}</span>
        )}
      </td>
      <td className="py-2.5 px-2">
        <button type="button" onClick={handleToggle} disabled={toggling}
          className={[
            'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
            rule.active ? 'bg-[#dcfce7] text-[#15803d] hover:bg-[#bbf7d0]' : 'bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]',
          ].join(' ')}>
          {toggling ? '…' : rule.active ? 'Active' : 'Inactive'}
        </button>
      </td>
      <td className="py-2.5 pl-2 pr-4">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={handleSave} disabled={saving}
              className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={handleCancel} disabled={saving}
              className="rounded border border-border px-2.5 py-1 text-xs font-medium text-text hover:bg-border/20 disabled:opacity-50">
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setEditing(true)}
            className="rounded border border-border px-2.5 py-1 text-xs font-medium text-text hover:bg-border/20">
            Edit
          </button>
        )}
      </td>
    </tr>
  );
}

interface ProductPricingTableProps {
  productId: string;
  token: string;
}

function ProductPricingTable({ productId, token }: ProductPricingTableProps) {
  const [entries, setEntries] = useState<ProductPricingEntry[]>([]);
  const [priceLists, setPriceLists] = useState<PriceListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingRow, setAddingRow] = useState(false);

  useEffect(() => {
    Promise.all([
      adminPriceListsApi.getProductPricing(token, productId),
      adminPriceListsApi.list(token, { limit: 100 }),
    ])
      .then(([pricing, plResult]) => {
        setEntries(pricing);
        setPriceLists(plResult.data.filter((pl) => pl.active));
      })
      .finally(() => setLoading(false));
  }, [token, productId]);

  function handleUpdate(updated: ProductPricingEntry) {
    setEntries((prev) => prev.map((e) => (e.rule.id === updated.rule.id ? updated : e)));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
        <span className="text-xs text-muted">Loading pricing…</span>
      </div>
    );
  }

  const showTable = entries.length > 0 || addingRow;

  return (
    <div>
      {!showTable && (
        <p className="mb-3 text-sm text-muted">No pricing rules yet. Add a row to set prices for this product.</p>
      )}
      {showTable && (
        <div className="mb-3 rounded-md border border-border overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#fafafa] border-b border-border">
              <tr>
                <th className="py-2 pl-4 pr-2 text-xs font-semibold uppercase tracking-wide text-muted">Price list</th>
                <th className="py-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">Min qty</th>
                <th className="py-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">Rule type</th>
                <th className="py-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">Value</th>
                <th className="py-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">Status</th>
                <th className="py-2 pl-2 pr-4 text-xs font-semibold uppercase tracking-wide text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <PricingEntryRow key={entry.rule.id} entry={entry} priceLists={priceLists} onUpdate={handleUpdate} token={token} />
              ))}
              {addingRow && priceLists.length > 0 && (
                <NewPricingRow
                  priceLists={priceLists}
                  productId={productId}
                  token={token}
                  onSave={(entry) => { setEntries((prev) => [...prev, entry]); setAddingRow(false); }}
                  onCancel={() => setAddingRow(false)}
                />
              )}
            </tbody>
          </table>
        </div>
      )}

      {addingRow && priceLists.length === 0 && (
        <p className="mb-3 text-sm text-red-500">No active price lists available. Create one first.</p>
      )}

      {!addingRow && (
        <button
          type="button"
          onClick={() => setAddingRow(true)}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 text-muted">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add price
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ProductFormProps {
  mode: 'create' | 'edit';
  token: string;
  initialValues?: Product;
  onSubmit: (data: CreateProductRequest) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function ProductForm({ mode, token, initialValues, onSubmit, onDelete }: ProductFormProps) {
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialValues?.name ?? '',
      description: initialValues?.description ?? '',
      sku: initialValues?.sku ?? '',
      status: initialValues?.status ?? ProductStatus.DRAFT,
      productTypeId: initialValues?.productType?.id ?? '',
      supplierId: initialValues?.supplier?.id ?? '',
      price: initialValues?.price ?? '',
      compareAtPrice: initialValues?.compareAtPrice ?? '',
    },
  });

  useEffect(() => {
    Promise.all([adminProductTypesApi.list(token), adminSuppliersApi.list(token)])
      .then(([types, sups]) => {
        setProductTypes(types);
        setSuppliers(sups);
      })
      .catch(() => {})
      .finally(() => setMetaLoading(false));
  }, [token]);

  async function onFormSubmit(data: FormValues) {
    setApiError(null);
    try {
      await onSubmit({
        name: data.name,
        description: data.description || undefined,
        sku: data.sku || undefined,
        status: data.status,
        productTypeId: data.productTypeId || undefined,
        supplierId: data.supplierId || undefined,
        price: data.price || undefined,
        compareAtPrice: data.compareAtPrice || undefined,
      });
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete();
    } catch {
      setIsDeleting(false);
      setDeleteConfirm(false);
    }
  }

  const disabled = isSubmitting || metaLoading;

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/products"
          className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Products
        </Link>
        <span className="text-border">/</span>
        <h1 className="text-xl font-semibold text-text">
          {mode === 'create' ? 'Add product' : (initialValues?.name ?? 'Edit product')}
        </h1>
      </div>

      {/* Two-column layout */}
      <form onSubmit={handleSubmit(onFormSubmit)} noValidate>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_288px]">

          {/* ── Left column ── */}
          <div className="space-y-5">

            {/* Title + Description */}
            <FormCard>
              <div className="space-y-4">
                <div>
                  <FieldLabel htmlFor="name">Title</FieldLabel>
                  <TextInput
                    id="name"
                    placeholder="Short sleeve t-shirt"
                    disabled={disabled}
                    {...register('name')}
                  />
                  <FieldError message={errors.name?.message} />
                </div>
                <div>
                  <FieldLabel htmlFor="description">Description</FieldLabel>
                  <textarea
                    id="description"
                    rows={5}
                    placeholder="Add a description for this product…"
                    disabled={disabled}
                    className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text placeholder-muted/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                    {...register('description')}
                  />
                  <FieldError message={errors.description?.message} />
                </div>
              </div>
            </FormCard>

            {/* Pricing */}
            <FormCard title="Pricing">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel htmlFor="price">Price</FieldLabel>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">$</span>
                    <TextInput
                      id="price"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      disabled={disabled}
                      style={{ paddingLeft: '1.75rem' }}
                      {...register('price')}
                    />
                  </div>
                  <FieldError message={errors.price?.message} />
                </div>
                <div>
                  <FieldLabel htmlFor="compareAtPrice">Compare-at price</FieldLabel>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">$</span>
                    <TextInput
                      id="compareAtPrice"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      disabled={disabled}
                      style={{ paddingLeft: '1.75rem' }}
                      {...register('compareAtPrice')}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted">Show a crossed-out original price</p>
                  <FieldError message={errors.compareAtPrice?.message} />
                </div>
              </div>
            </FormCard>

            {/* Price list rules — edit mode only */}
            {mode === 'edit' && initialValues && (
              <FormCard title="Price list pricing">
                <ProductPricingTable productId={initialValues.id} token={token} />
              </FormCard>
            )}
          </div>

          {/* ── Right column ── */}
          <div className="space-y-5">

            {/* Product status */}
            <FormCard title="Product status">
              <div className="space-y-2">
                {STATUS_OPTIONS.map(({ value, label, color }) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-[hsl(var(--color-border)/20%)]"
                  >
                    <input
                      type="radio"
                      value={value}
                      disabled={disabled}
                      className="h-4 w-4 accent-primary"
                      {...register('status')}
                    />
                    <span className="flex items-center gap-2 text-sm font-medium text-text">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </FormCard>

            {/* Product organization */}
            <FormCard title="Product organization">
              <div className="space-y-4">
                <div>
                  <FieldLabel htmlFor="productTypeId">Product type</FieldLabel>
                  {metaLoading ? (
                    <div className="h-9 animate-pulse rounded-md bg-border/30" />
                  ) : (
                    <SelectInput
                      id="productTypeId"
                      disabled={disabled}
                      {...register('productTypeId')}
                    >
                      <option value="">— None —</option>
                      {productTypes.map((pt) => (
                        <option key={pt.id} value={pt.id}>
                          {pt.name}
                        </option>
                      ))}
                    </SelectInput>
                  )}
                </div>
                <div>
                  <FieldLabel htmlFor="supplierId">Supplier</FieldLabel>
                  {metaLoading ? (
                    <div className="h-9 animate-pulse rounded-md bg-border/30" />
                  ) : (
                    <SelectInput
                      id="supplierId"
                      disabled={disabled}
                      {...register('supplierId')}
                    >
                      <option value="">— None —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </SelectInput>
                  )}
                </div>
                <div>
                  <FieldLabel htmlFor="sku">SKU (Stock Keeping Unit)</FieldLabel>
                  <TextInput
                    id="sku"
                    placeholder="e.g. WINE-CAB-2021"
                    disabled={disabled}
                    {...register('sku')}
                  />
                </div>
              </div>
            </FormCard>

            {/* Danger zone — delete (edit mode only) */}
            {mode === 'edit' && onDelete && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                {!deleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(true)}
                    className="w-full rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:border-red-400"
                  >
                    Delete product
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-red-700">Are you sure? This cannot be undone.</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                      >
                        {isDeleting ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(false)}
                        className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Form actions */}
        {apiError && (
          <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {apiError}
          </div>
        )}
        <div className="mt-5 flex items-center justify-end gap-3 border-t border-border pt-5">
          <Link
            href="/products"
            className="rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            Discard
          </Link>
          <button
            type="submit"
            disabled={disabled}
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : mode === 'create' ? 'Save product' : 'Save changes'}
          </button>
        </div>
      </form>
    </>
  );
}
