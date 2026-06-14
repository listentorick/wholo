'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminPriceListsApi, adminProductsApi } from '@wholo/admin-api-client';
import type { PriceList, PriceListRule, PriceListSummary, Product, CreatePriceListRequest } from '@wholo/types';
import {
  PriceListRuleSelectorType,
  PriceListRuleValueType,
  PriceListRuleDiscountBaseType,
  ProductStatus,
} from '@wholo/types';

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  currency: z.string().min(1, 'Currency is required'),
});

type FormValues = z.infer<typeof schema>;

// ─── Drawer state ─────────────────────────────────────────────────────────────

type DrawerState =
  | { mode: 'create-fixed' }
  | { mode: 'create-discount' }
  | { mode: 'edit'; rule: PriceListRule }
  | null;

// ─── Shared UI helpers ────────────────────────────────────────────────────────

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
    <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">
      {children}
    </label>
  );
}

function TextInput({ id, placeholder, disabled, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
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

const inputCls = 'rounded border border-border bg-white px-2 py-1.5 text-xs text-text outline-none focus:border-primary disabled:opacity-50';

// ─── Segmented control ────────────────────────────────────────────────────────

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}

function SegmentedControl<T extends string>({ value, onChange, options, disabled }: SegmentedControlProps<T>) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={[
            'rounded-md px-3 py-1.5 text-sm font-medium transition-all disabled:opacity-50',
            value === opt.value
              ? 'bg-white shadow-sm text-text'
              : 'text-muted hover:text-text',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── Product picker ────────────────────────────────────────────────────────────

interface ProductPickerProps {
  token: string;
  selectedId: string;
  onSelect: (productId: string) => void;
  disabled?: boolean;
}

function ProductPicker({ token, selectedId, onSelect, disabled }: ProductPickerProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminProductsApi.list(token, { limit: 500, status: ProductStatus.ACTIVE })
      .then((r) => setProducts(r.data))
      .finally(() => setLoading(false));
  }, [token]);

  const selectedProduct = products.find((p) => p.id === selectedId);

  const filtered = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-primary" />
        <span className="text-xs text-muted">Loading products…</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Selected product card */}
      {selectedProduct && (
        <div className="rounded-md border border-primary/30 bg-[#eff6ff] px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text truncate">{selectedProduct.name}</p>
              <p className="text-xs text-muted mt-0.5">
                {selectedProduct.sku ? `SKU: ${selectedProduct.sku}` : 'No SKU'}
                {selectedProduct.price ? ` · £${selectedProduct.price}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect('')}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted hover:text-text hover:bg-white/70 transition-colors disabled:opacity-50"
              >
                <XIcon className="h-3 w-3" />
                Change
              </button>
              <a
                href={`/products/${selectedProduct.id}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-primary hover:bg-white/70 transition-colors"
              >
                View
                <ExternalLinkIcon className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Search by name or SKU…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        disabled={disabled}
        className={`${inputCls} w-full`}
      />

      {/* List */}
      <div className="overflow-y-auto rounded-md border border-border" style={{ maxHeight: 200 }}>
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted text-center">No products found.</p>
        ) : (
          filtered.map((p) => {
            const isSelected = selectedId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(p.id)}
                className={[
                  'flex w-full items-center gap-2 border-b border-border px-3 py-2.5 text-left last:border-0 transition-colors',
                  isSelected
                    ? 'bg-[#eff6ff] border-l-2 border-l-primary'
                    : 'hover:bg-surface',
                ].join(' ')}
              >
                <span className={[
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                  isSelected ? 'border-primary bg-primary' : 'border-border',
                ].join(' ')}>
                  {isSelected && <CheckIcon className="h-2.5 w-2.5 text-white" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-medium text-text truncate">{p.name}</span>
                  <span className="text-[11px] text-muted">
                    {p.sku ? `SKU: ${p.sku}` : 'No SKU'}{p.price ? ` · £${p.price}` : ''}
                  </span>
                </span>
                <a
                  href={`/products/${p.id}/edit`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 text-muted hover:text-text transition-colors"
                  title="View product"
                >
                  <ExternalLinkIcon className="h-3.5 w-3.5" />
                </a>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Rule drawer ───────────────────────────────────────────────────────────────

interface RuleDrawerProps {
  state: NonNullable<DrawerState>;
  priceListId: string;
  pricelists: PriceListSummary[];
  token: string;
  onSaved: (rule: PriceListRule) => void;
  onClose: () => void;
}

function RuleDrawer({ state, priceListId, pricelists, token, onSaved, onClose }: RuleDrawerProps) {
  const isEdit = state.mode === 'edit';
  const editRule = isEdit ? state.rule : null;
  const isDiscount =
    state.mode === 'create-discount' ||
    editRule?.valueType === PriceListRuleValueType.PERCENTAGE_DISCOUNT;

  // Slide animation
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  // Form state
  const [selectorType, setSelectorType] = useState<PriceListRuleSelectorType>(
    editRule?.selectorType ?? PriceListRuleSelectorType.ALL_PRODUCTS,
  );
  const [selectedProductId, setSelectedProductId] = useState(editRule?.productId ?? '');
  const [minQuantity, setMinQuantity] = useState(String(editRule?.minQuantity ?? 1));
  const [unitPrice, setUnitPrice] = useState(editRule?.unitPrice ?? '');
  const [pct, setPct] = useState(editRule?.discountPercentage ?? '');
  const [discountBase, setDiscountBase] = useState<PriceListRuleDiscountBaseType>(
    editRule?.discountBaseType ?? PriceListRuleDiscountBaseType.PRODUCT_PRICE,
  );
  const [basePriceListId, setBasePriceListId] = useState(editRule?.basePriceListId ?? '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const title = isEdit
    ? 'Edit rule'
    : isDiscount
    ? 'Add discount rule'
    : 'Add fixed price rule';

  const availableLists = pricelists.filter((p) => p.active && p.id !== priceListId);

  function validate(): boolean {
    const e: Record<string, string> = {};
    const qty = parseInt(minQuantity, 10);
    if (isNaN(qty) || qty < 1) e.minQuantity = 'Must be at least 1.';
    if (selectorType === PriceListRuleSelectorType.PRODUCT && !selectedProductId) {
      e.product = 'Select a product.';
    }
    if (!isDiscount) {
      if (!unitPrice || isNaN(parseFloat(unitPrice))) e.unitPrice = 'Enter a valid price.';
    } else {
      const p = parseFloat(pct);
      if (!pct || isNaN(p) || p <= 0 || p > 100) e.pct = 'Enter a percentage between 0 and 100.';
      if (discountBase === PriceListRuleDiscountBaseType.PRICE_LIST && !basePriceListId) {
        e.basePriceListId = 'Select a base price list.';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const qty = parseInt(minQuantity, 10);
      let rule: PriceListRule;

      if (isEdit && editRule) {
        rule = await adminPriceListsApi.updateRule(token, priceListId, editRule.id, {
          minQuantity: qty,
          ...(!isDiscount
            ? { unitPrice: parseFloat(unitPrice).toFixed(2) }
            : {
                discountPercentage: parseFloat(pct).toFixed(2),
                discountBaseType: discountBase,
                basePriceListId:
                  discountBase === PriceListRuleDiscountBaseType.PRICE_LIST
                    ? basePriceListId
                    : undefined,
              }),
        });
      } else {
        rule = await adminPriceListsApi.createRule(token, priceListId, {
          selectorType,
          productId:
            selectorType === PriceListRuleSelectorType.PRODUCT ? selectedProductId : undefined,
          minQuantity: qty,
          valueType: isDiscount
            ? PriceListRuleValueType.PERCENTAGE_DISCOUNT
            : PriceListRuleValueType.FIXED_PRICE,
          ...(!isDiscount
            ? { unitPrice: parseFloat(unitPrice).toFixed(2) }
            : {
                discountPercentage: parseFloat(pct).toFixed(2),
                discountBaseType: discountBase,
                basePriceListId:
                  discountBase === PriceListRuleDiscountBaseType.PRICE_LIST
                    ? basePriceListId
                    : undefined,
              }),
        });
      }

      onSaved(rule);
      handleClose();
    } catch (err: unknown) {
      setErrors({ form: err instanceof Error ? err.message : 'Failed to save. Please try again.' });
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{ backgroundColor: 'rgba(0,0,0,0.35)', opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />

      {/* Drawer panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-white shadow-2xl transition-transform duration-300 ease-out"
        style={{
          width: 'min(560px, 95vw)',
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <h2 className="text-base font-semibold text-text">{title}</h2>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-text transition-colors"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Applies to */}
          <div>
            <FieldLabel>Applies to</FieldLabel>
            {isEdit ? (
              <div className="space-y-1">
                <p className="text-sm text-text">
                  {editRule?.selectorType === PriceListRuleSelectorType.ALL_PRODUCTS
                    ? 'All products'
                    : editRule?.productName ?? 'Specific product'}
                </p>
                {editRule?.selectorType === PriceListRuleSelectorType.PRODUCT && editRule.productId && (
                  <a
                    href={`/products/${editRule.productId}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    View product
                    <ExternalLinkIcon className="h-3 w-3" />
                  </a>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <SegmentedControl<PriceListRuleSelectorType>
                  value={selectorType}
                  onChange={setSelectorType}
                  disabled={saving}
                  options={[
                    { value: PriceListRuleSelectorType.ALL_PRODUCTS, label: 'All products' },
                    { value: PriceListRuleSelectorType.PRODUCT, label: 'Specific product' },
                  ]}
                />
                {selectorType === PriceListRuleSelectorType.PRODUCT && (
                  <div>
                    <ProductPicker
                      token={token}
                      selectedId={selectedProductId}
                      onSelect={setSelectedProductId}
                      disabled={saving}
                    />
                    {errors.product && (
                      <p className="mt-1.5 text-xs text-red-500">{errors.product}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Min quantity */}
          <div>
            <FieldLabel htmlFor="minQuantity">Min quantity</FieldLabel>
            <input
              id="minQuantity"
              type="number"
              min={1}
              value={minQuantity}
              onChange={(e) => setMinQuantity(e.target.value)}
              disabled={saving}
              className="w-24 rounded-md border border-border bg-white px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            {errors.minQuantity && (
              <p className="mt-1.5 text-xs text-red-500">{errors.minQuantity}</p>
            )}
          </div>

          {/* Fixed price fields */}
          {!isDiscount && (
            <div>
              <FieldLabel htmlFor="unitPrice">Unit price</FieldLabel>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted">£</span>
                <input
                  id="unitPrice"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  disabled={saving}
                  className="w-32 rounded-md border border-border bg-white px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
              </div>
              {errors.unitPrice && (
                <p className="mt-1.5 text-xs text-red-500">{errors.unitPrice}</p>
              )}
            </div>
          )}

          {/* Discount fields — inline cohesive layout */}
          {isDiscount && (
            <div className="space-y-3">
              <FieldLabel>Discount</FieldLabel>

              {/* [pct input] % off [segmented control] — all on one line */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <input
                    id="pct"
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={pct}
                    onChange={(e) => setPct(e.target.value)}
                    disabled={saving}
                    className="w-20 rounded-md border border-border bg-white px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 text-center"
                  />
                  <span className="text-sm text-muted whitespace-nowrap">% off</span>
                </div>

                <SegmentedControl<PriceListRuleDiscountBaseType>
                  value={discountBase}
                  onChange={setDiscountBase}
                  disabled={saving}
                  options={[
                    { value: PriceListRuleDiscountBaseType.PRODUCT_PRICE, label: 'Product price' },
                    { value: PriceListRuleDiscountBaseType.PRICE_LIST, label: 'Another list' },
                  ]}
                />
              </div>

              {errors.pct && <p className="text-xs text-red-500">{errors.pct}</p>}

              {/* Base price list — shown when "Another list" selected */}
              {discountBase === PriceListRuleDiscountBaseType.PRICE_LIST && (
                <div>
                  <FieldLabel htmlFor="basePriceListId">Base price list</FieldLabel>
                  <select
                    id="basePriceListId"
                    value={basePriceListId}
                    onChange={(e) => setBasePriceListId(e.target.value)}
                    disabled={saving}
                    className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
                  >
                    <option value="">Select a price list…</option>
                    {availableLists.map((pl) => (
                      <option key={pl.id} value={pl.id}>{pl.name}</option>
                    ))}
                  </select>
                  {errors.basePriceListId && (
                    <p className="mt-1.5 text-xs text-red-500">{errors.basePriceListId}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {errors.form && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {errors.form}
            </div>
          )}
        </div>

        {/* Footer — right-aligned */}
        <div className="border-t border-border px-6 py-4 shrink-0 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add rule'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Rule row (display only) ───────────────────────────────────────────────────

interface RuleRowProps {
  rule: PriceListRule;
  pricelists: PriceListSummary[];
  onEdit: (rule: PriceListRule) => void;
  onToggle: (rule: PriceListRule) => Promise<void>;
  onDelete: (rule: PriceListRule) => Promise<void>;
}

function RuleRow({ rule, pricelists, onEdit, onToggle, onDelete }: RuleRowProps) {
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isDiscount = rule.valueType === PriceListRuleValueType.PERCENTAGE_DISCOUNT;
  const basePriceListName = pricelists.find((p) => p.id === rule.basePriceListId)?.name;

  const selectorLabel =
    rule.selectorType === PriceListRuleSelectorType.ALL_PRODUCTS
      ? 'All products'
      : (rule.productName ?? 'Specific product');

  async function handleToggle() {
    setToggling(true);
    try { await onToggle(rule); } finally { setToggling(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try { await onDelete(rule); } finally { setDeleting(false); }
  }

  return (
    <tr className={['border-b border-border last:border-0 transition-colors', !rule.active ? 'opacity-50' : ''].join(' ')}>
      <td className="py-2.5 pl-4 pr-2 text-sm text-text">{selectorLabel}</td>
      <td className="py-2.5 px-2 text-sm text-text">{rule.minQuantity}</td>
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
        {isDiscount ? (
          <span className="text-sm text-text">
            {rule.discountPercentage}%{' '}
            <span className="text-muted">off </span>
            {rule.discountBaseType === PriceListRuleDiscountBaseType.PRODUCT_PRICE
              ? <span className="text-muted">product price</span>
              : <span>{basePriceListName ?? rule.basePriceListId}</span>
            }
          </span>
        ) : (
          <span className="font-mono text-sm text-text">{rule.currency} {rule.unitPrice}</span>
        )}
      </td>
      <td className="py-2.5 px-2">
        <button
          type="button"
          onClick={handleToggle}
          disabled={toggling}
          className={[
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
            rule.active
              ? 'bg-[#dcfce7] text-[#15803d] hover:bg-[#bbf7d0]'
              : 'bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]',
          ].join(' ')}
        >
          {toggling ? '…' : rule.active ? 'Active' : 'Inactive'}
        </button>
      </td>
      <td className="py-2.5 pl-2 pr-4">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onEdit(rule)}
            className="rounded border border-border px-2.5 py-1 text-xs font-medium text-text hover:bg-border/20 transition-colors"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center justify-center h-6 w-6 rounded text-muted hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
            title="Remove rule"
          >
            {deleting
              ? <span className="h-3.5 w-3.5 block animate-spin rounded-full border-2 border-current border-t-transparent" />
              : <TrashIcon className="h-3.5 w-3.5" />
            }
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Rules table ──────────────────────────────────────────────────────────────

interface RulesTableProps {
  token: string;
  priceListId: string;
}

function RulesTable({ token, priceListId }: RulesTableProps) {
  const [rules, setRules] = useState<PriceListRule[]>([]);
  const [pricelists, setPricelists] = useState<PriceListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerState, setDrawerState] = useState<DrawerState>(null);

  useEffect(() => {
    Promise.all([
      adminPriceListsApi.listRules(token, priceListId),
      adminPriceListsApi.list(token, { limit: 100 }).then((r) => r.data),
    ]).then(([r, p]) => { setRules(r); setPricelists(p); }).finally(() => setLoading(false));
  }, [token, priceListId]);

  function handleSaved(rule: PriceListRule) {
    if (drawerState?.mode === 'edit') {
      setRules((prev) => prev.map((r) => (r.id === rule.id ? rule : r)));
    } else {
      setRules((prev) => [...prev, rule]);
    }
  }

  async function handleToggle(rule: PriceListRule) {
    const updated = await adminPriceListsApi.updateRule(token, priceListId, rule.id, { active: !rule.active });
    setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
  }

  async function handleDelete(rule: PriceListRule) {
    await adminPriceListsApi.deleteRule(token, priceListId, rule.id);
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
        <span className="text-xs text-muted">Loading rules…</span>
      </div>
    );
  }

  return (
    <div>
      {rules.length === 0 && (
        <p className="mb-3 text-sm text-muted">No pricing rules yet. Add a rule to set prices for customers on this list.</p>
      )}

      {rules.length > 0 && (
        <div className="mb-3 rounded-md border border-border overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#fafafa] border-b border-border">
              <tr>
                <th className="py-2 pl-4 pr-2 text-xs font-semibold uppercase tracking-wide text-muted">Applies to</th>
                <th className="py-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">Min qty</th>
                <th className="py-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">Type</th>
                <th className="py-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">Value</th>
                <th className="py-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">Status</th>
                <th className="py-2 pl-2 pr-4 text-xs font-semibold uppercase tracking-wide text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  pricelists={pricelists}
                  onEdit={(r) => setDrawerState({ mode: 'edit', rule: r })}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDrawerState({ mode: 'create-fixed' })}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 text-muted">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add fixed rule
        </button>
        <button
          type="button"
          onClick={() => setDrawerState({ mode: 'create-discount' })}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 text-muted">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add discount rule
        </button>
      </div>

      {drawerState && (
        <RuleDrawer
          state={drawerState}
          priceListId={priceListId}
          pricelists={pricelists}
          token={token}
          onSaved={handleSaved}
          onClose={() => setDrawerState(null)}
        />
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PriceListFormProps {
  mode: 'create' | 'edit';
  token: string;
  initialValues?: PriceList;
  onSubmit: (data: CreatePriceListRequest) => Promise<PriceList>;
  onDelete?: () => Promise<void>;
  onSetDefault?: () => Promise<void>;
  onCancel?: () => void;
}

export function PriceListForm({ mode, token, initialValues, onSubmit, onDelete, onSetDefault, onCancel }: PriceListFormProps) {
  const router = useRouter();
  const isDrawer = !!onCancel;
  const [apiError, setApiError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSettingDefault, setIsSettingDefault] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialValues?.name ?? '',
      description: initialValues?.description ?? '',
      currency: initialValues?.currency ?? 'GBP',
    },
  });

  async function onFormSubmit(data: FormValues) {
    setApiError(null);
    try {
      const result = await onSubmit({
        name: data.name,
        description: data.description || undefined,
        currency: data.currency,
      });
      if (mode === 'create') {
        if (isDrawer) {
          onCancel?.();
        } else {
          router.push(`/pricelists/${result.id}/edit`);
        }
      }
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

  async function handleSetDefault() {
    if (!onSetDefault) return;
    setIsSettingDefault(true);
    try {
      await onSetDefault();
    } finally {
      setIsSettingDefault(false);
    }
  }

  const disabled = isSubmitting;

  return (
    <>
      {/* ── Header ── */}
      <div className="mb-6 flex items-center gap-4">
        {isDrawer ? (
          <>
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-text">
              {mode === 'create' ? 'New price list' : (initialValues?.name ?? 'Edit price list')}
            </h1>
            {initialValues?.isDefault && (
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-[#dbeafe] text-[#1d4ed8]">
                Default
              </span>
            )}
          </>
        ) : (
          <>
            <Link
              href="/pricelists"
              className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Price lists
            </Link>
            <span className="text-border">/</span>
            <h1 className="text-xl font-semibold text-text">
              {mode === 'create' ? 'New price list' : (initialValues?.name ?? 'Edit price list')}
            </h1>
            {initialValues?.isDefault && (
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-[#dbeafe] text-[#1d4ed8]">
                Default
              </span>
            )}
          </>
        )}
      </div>

      <form onSubmit={handleSubmit(onFormSubmit)} noValidate>
        <div className={isDrawer ? 'space-y-5' : 'grid grid-cols-1 gap-5 lg:grid-cols-[1fr_256px]'}>

          {/* ── Main column ── */}
          <div className="space-y-5">
            <FormCard title="Details">
              <div className="space-y-4">
                <div>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <TextInput
                    id="name"
                    placeholder="e.g. Retail, Wholesale, VIP"
                    disabled={disabled}
                    {...register('name')}
                  />
                  {errors.name && <p className="mt-1.5 text-xs text-red-500">{errors.name.message}</p>}
                </div>
                <div>
                  <FieldLabel htmlFor="description">Description</FieldLabel>
                  <textarea
                    id="description"
                    rows={3}
                    placeholder="Optional description…"
                    disabled={disabled}
                    className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text placeholder-muted/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                    {...register('description')}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="currency">Currency</FieldLabel>
                  <TextInput
                    id="currency"
                    placeholder="GBP"
                    disabled={disabled || mode === 'edit'}
                    {...register('currency')}
                  />
                  {mode === 'edit' && (
                    <p className="mt-1 text-xs text-muted">Currency cannot be changed after creation.</p>
                  )}
                </div>
              </div>
            </FormCard>

            {mode === 'edit' && initialValues && (
              <FormCard title="Pricing rules">
                <RulesTable token={token} priceListId={initialValues.id} />
              </FormCard>
            )}

            {/* ── Drawer footer ── */}
            {isDrawer && (
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-text"
                >
                  Cancel
                </button>
                {apiError && (
                  <p className="self-center text-xs text-red-500">{apiError}</p>
                )}
                <button
                  type="submit"
                  disabled={disabled}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving…' : mode === 'create' ? 'Create price list' : 'Save changes'}
                </button>
              </div>
            )}
          </div>

          {/* ── Right column (full-page only) ── */}
          {!isDrawer && (
            <div className="space-y-5">
              <FormCard>
                <div className="space-y-2">
                  {apiError && (
                    <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {apiError}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={disabled}
                    className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving…' : mode === 'create' ? 'Create price list' : 'Save changes'}
                  </button>
                  <Link
                    href="/pricelists"
                    className="block w-full rounded-md px-4 py-2 text-center text-sm font-medium text-muted transition-colors hover:text-text"
                  >
                    Discard
                  </Link>
                </div>
              </FormCard>

              {mode === 'edit' && onSetDefault && !initialValues?.isDefault && (
                <FormCard title="Default price list">
                  <p className="mb-3 text-sm text-muted">
                    Set this as the default price list for customers with no explicit assignment.
                  </p>
                  <button
                    type="button"
                    onClick={handleSetDefault}
                    disabled={isSettingDefault}
                    className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20 disabled:opacity-50"
                  >
                    {isSettingDefault ? 'Saving…' : 'Set as default'}
                  </button>
                </FormCard>
              )}

              {mode === 'edit' && onDelete && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  {!deleteConfirm ? (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(true)}
                      className="w-full rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:border-red-400"
                    >
                      Deactivate price list
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-red-700">Deactivate this price list?</p>
                      <p className="text-xs text-red-600">Customers assigned to it will lose their prices.</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={isDeleting}
                          className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                        >
                          {isDeleting ? 'Deactivating…' : 'Yes, deactivate'}
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
          )}
        </div>
      </form>
    </>
  );
}
