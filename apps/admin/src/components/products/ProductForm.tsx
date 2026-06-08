'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { ProductStatus } from '@wholo/types';
import type { ProductType, Supplier, Product, CreateProductRequest } from '@wholo/types';
import { adminProductTypesApi, adminSuppliersApi } from '@wholo/admin-api-client';

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
