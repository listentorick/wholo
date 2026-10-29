'use client';

import { useState, useEffect } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ProductStatus, PriceListRuleSelectorType, PriceListRuleValueType, PriceListRuleDiscountBaseType, formatMoney, getCurrencySymbol } from '@wholo/types';
import type { ProductType, Supplier, TaxType, Product, CreateProductRequest, ProductPricingEntry, PriceListSummary } from '@wholo/types';
import { adminProductTypesApi, adminSuppliersApi, adminPriceListsApi, adminTaxTypesApi } from '@wholo/admin-api-client';
import { FormCard, FieldLabel, FieldError, TextInput, SelectInput } from '@/components/form';
import { DetailPageHeader } from '@/components/detail/DetailPageHeader';
import { DetailPageLayout } from '@/components/detail/DetailPageLayout';
import { DetailActionsPanel, type ActionItem } from '@/components/detail/DetailActionsPanel';
import { ProductImageUploader } from './ProductImageUploader';

// ─── Schema ──────────────────────────────────────────────────────────────────

const priceField = z
  .string()
  .optional()
  .refine(
    (val) => !val || (/^\d+(\.\d{0,2})?$/.test(val) && parseFloat(val) >= 0),
    'Enter a valid price (e.g. 12.99)',
  );

export const productSchema = z
  .object({
    name: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    sku: z.string().optional(),
    status: z.nativeEnum(ProductStatus),
    productTypeId: z.string().optional(),
    supplierId: z.string().optional(),
    taxTypeId: z.string().optional(),
    price: priceField,
  })
  .superRefine((data, ctx) => {
    if (data.status === ProductStatus.ACTIVE && !data.taxTypeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['taxTypeId'],
        message: 'Assign a tax type before setting this product to Active.',
      });
    }
  });

export type ProductFormValues = z.infer<typeof productSchema>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: ProductStatus; label: string; color: string }[] = [
  { value: ProductStatus.ACTIVE, label: 'Active', color: '#16a34a' },
  { value: ProductStatus.DRAFT, label: 'Draft', color: '#d97706' },
  { value: ProductStatus.ARCHIVED, label: 'Archived', color: '#6b7280' },
];

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
}

function NewPricingRow({ priceLists, productId, onSave, onCancel }: NewPricingRowProps) {
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
      const rule = await adminPriceListsApi.createRule(priceListId, {
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
            <span className="text-xs text-muted">
              {getCurrencySymbol(priceLists.find((p) => p.id === priceListId)?.currency ?? 'GBP')}
            </span>
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
}

function PricingEntryRow({ entry, priceLists, onUpdate }: PricingEntryRowProps) {
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
      const updated = await adminPriceListsApi.updateRule(entry.priceListId, rule.id, {
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
      const updated = await adminPriceListsApi.updateRule(entry.priceListId, rule.id, { active: !rule.active });
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
              <span className="text-xs text-muted">{getCurrencySymbol(entry.currency)}</span>
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
          <span className="font-mono text-sm text-text">{formatMoney(rule.unitPrice ?? 0, entry.currency)}</span>
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
}

export function ProductPricingTable({ productId }: ProductPricingTableProps) {
  const [entries, setEntries] = useState<ProductPricingEntry[]>([]);
  const [priceLists, setPriceLists] = useState<PriceListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingRow, setAddingRow] = useState(false);

  useEffect(() => {
    Promise.all([
      adminPriceListsApi.getProductPricing(productId),
      adminPriceListsApi.list({ limit: 100 }),
    ])
      .then(([pricing, plResult]) => {
        setEntries(pricing);
        setPriceLists(plResult.data.filter((pl) => pl.active));
      })
      .finally(() => setLoading(false));
  }, [productId]);

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
                <PricingEntryRow key={entry.rule.id} entry={entry} priceLists={priceLists} onUpdate={handleUpdate} />
              ))}
              {addingRow && priceLists.length > 0 && (
                <NewPricingRow
                  priceLists={priceLists}
                  productId={productId}
                 
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

// ─── Shared pieces ────────────────────────────────────────────────────────────
// The create form below and the tabbed product page (app/(app)/products/[id])
// are built from the same sections, so a field is defined once.

export function productDefaultValues(product?: Product): ProductFormValues {
  return {
    name: product?.name ?? '',
    description: product?.description ?? '',
    sku: product?.sku ?? '',
    status: product?.status ?? ProductStatus.DRAFT,
    productTypeId: product?.productType?.id ?? '',
    supplierId: product?.supplier?.id ?? '',
    taxTypeId: product?.taxType?.id ?? '',
    price: product?.price ?? '',
  };
}

export function toProductRequest(data: ProductFormValues): CreateProductRequest {
  return {
    name: data.name,
    description: data.description || undefined,
    sku: data.sku || undefined,
    status: data.status,
    productTypeId: data.productTypeId || undefined,
    supplierId: data.supplierId || undefined,
    taxTypeId: data.taxTypeId || undefined,
    price: data.price || undefined,
  };
}

export interface ProductMeta {
  productTypes: ProductType[];
  suppliers: Supplier[];
  taxTypes: TaxType[];
  loading: boolean;
}

export function useProductMeta(): ProductMeta {
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [taxTypes, setTaxTypes] = useState<TaxType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminProductTypesApi.list(), adminSuppliersApi.list(), adminTaxTypesApi.list({ limit: 100 })])
      .then(([types, sups, taxes]) => {
        setProductTypes(types);
        setSuppliers(sups);
        setTaxTypes(taxes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { productTypes, suppliers, taxTypes, loading };
}

interface FieldsProps {
  form: UseFormReturn<ProductFormValues>;
  meta: ProductMeta;
  disabled: boolean;
  /** Set once the product exists — enables the parts that need its id (images, price list overrides). */
  productId?: string;
}

/** Fields that live under the Pricing tab — used to open that tab when one fails validation. */
export const PRICING_FIELDS: (keyof ProductFormValues)[] = ['price', 'taxTypeId'];

// Title, description, organisation and images.
export function ProductDetailsFields({ form, meta, disabled, productId }: FieldsProps) {
  const { register, formState: { errors } } = form;
  return (
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

      {/* Product organization */}
      <FormCard title="Product organization">
        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="productTypeId">Product type</FieldLabel>
            {meta.loading ? (
              <div className="h-9 animate-pulse rounded-md bg-border/30" />
            ) : (
              <SelectInput
                id="productTypeId"
                disabled={disabled}
                {...register('productTypeId')}
              >
                <option value="">— None —</option>
                {meta.productTypes.map((pt) => (
                  <option key={pt.id} value={pt.id}>
                    {pt.name}
                  </option>
                ))}
              </SelectInput>
            )}
          </div>
          <div>
            <FieldLabel htmlFor="supplierId">Supplier</FieldLabel>
            {meta.loading ? (
              <div className="h-9 animate-pulse rounded-md bg-border/30" />
            ) : (
              <SelectInput
                id="supplierId"
                disabled={disabled}
                {...register('supplierId')}
              >
                <option value="">— None —</option>
                {meta.suppliers.map((s) => (
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

      {/* Product images — existing products only */}
      {productId && (
        <FormCard title="Product images">
          <ProductImageUploader productId={productId} />
        </FormCard>
      )}
    </div>
  );
}

// Default price, tax type and price list overrides.
export function ProductPricingFields({ form, meta, disabled, productId, currencyCode }: FieldsProps & { currencyCode: string }) {
  const { register, watch, formState: { errors } } = form;
  const selectedTaxType = meta.taxTypes.find((t) => t.id === watch('taxTypeId'));
  return (
    <FormCard title="Pricing">
      <div className="max-w-[calc(50%-0.5rem)]">
        <FieldLabel htmlFor="price">Price</FieldLabel>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">{getCurrencySymbol(currencyCode)}</span>
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
        <p className="mt-1 text-xs text-muted">The price customers pay by default.</p>
        <FieldError message={errors.price?.message} />
      </div>

      {/* Tax */}
      <div className="mt-4">
        <FieldLabel htmlFor="taxTypeId">Tax type</FieldLabel>
        {meta.loading ? (
          <div className="h-9 animate-pulse rounded-md bg-border/30" />
        ) : (
          <SelectInput id="taxTypeId" disabled={disabled} {...register('taxTypeId')}>
            <option value="">— None —</option>
            {meta.taxTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.ratePercentage}%){t.active ? '' : ' — inactive'}
              </option>
            ))}
          </SelectInput>
        )}
        <p className="mt-1 text-xs text-muted">
          Tax is calculated on top of the price above. Required before this product can be set to Active.
        </p>
        {selectedTaxType?.isDefault && (
          <p className="mt-1.5 text-xs text-amber-700">
            This is the automatic default tax type — pick the correct one for this product when you know it.
          </p>
        )}
        <FieldError message={errors.taxTypeId?.message} />
      </div>

      {/* Price list rules — existing products only */}
      {productId && (
        <div className="mt-5 border-t border-border pt-5">
          <FieldLabel>Price list overrides</FieldLabel>
          <p className="mb-3 text-xs text-muted">Overrides the default price above for customers on a matching price list.</p>
          <ProductPricingTable productId={productId} />
        </div>
      )}
    </FormCard>
  );
}

export function ProductStatusCard({ form, disabled }: { form: UseFormReturn<ProductFormValues>; disabled: boolean }) {
  return (
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
              {...form.register('status')}
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
  );
}

// ─── Create form ──────────────────────────────────────────────────────────────
// Adding a product is one stacked form; an existing product opens the tabbed
// page instead.

interface ProductFormProps {
  currencyCode: string;
  onSubmit: (data: CreateProductRequest) => Promise<void>;
}

export function ProductForm({ currencyCode, onSubmit }: ProductFormProps) {
  const meta = useProductMeta();
  const [apiError, setApiError] = useState<string | null>(null);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: productDefaultValues(),
  });
  const { handleSubmit, formState: { isSubmitting } } = form;

  async function onFormSubmit(data: ProductFormValues) {
    setApiError(null);
    try {
      await onSubmit(toProductRequest(data));
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  const disabled = isSubmitting || meta.loading;

  const actions: ActionItem[] = [
    {
      key: 'save',
      label: 'Save product',
      tone: 'primary',
      type: 'submit',
      disabled,
      loading: isSubmitting,
      loadingLabel: 'Saving…',
    },
    { key: 'discard', label: 'Discard', href: '/products' },
  ];

  return (
    <>
      <DetailPageHeader backHref="/products" backLabel="Products" heading="Add product" headingStyle="accent" />

      <form onSubmit={handleSubmit(onFormSubmit)} noValidate>
        <DetailPageLayout
          sidebar={
            <>
              <DetailActionsPanel layout="sidebar" actions={actions} banner={{ error: apiError }} />
              <ProductStatusCard form={form} disabled={disabled} />
            </>
          }
        >
          <div className="space-y-5">
            <ProductDetailsFields form={form} meta={meta} disabled={disabled} />
            <ProductPricingFields form={form} meta={meta} disabled={disabled} currencyCode={currencyCode} />
          </div>
        </DetailPageLayout>
      </form>
    </>
  );
}
