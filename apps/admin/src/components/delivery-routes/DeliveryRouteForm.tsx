'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminDeliveryRoutesApi } from '@wholo/admin-api-client';
import type {
  DeliveryRoute,
  DeliveryRouteCustomer,
  CreateDeliveryRouteRequest,
  UpdateDeliveryRouteRequest,
} from '@wholo/types';
import { FormCard, FieldLabel, TextInput } from '@/components/form';
import { DetailPageHeader } from '@/components/detail/DetailPageHeader';
import { DetailPageLayout } from '@/components/detail/DetailPageLayout';
import { DetailActionsPanel, type ActionItem } from '@/components/detail/DetailActionsPanel';
import { RouteCustomerAssignmentPanel } from './RouteCustomerAssignmentPanel';

interface Props {
  route?: DeliveryRoute;
}

export function DeliveryRouteForm({ route }: Props) {
  const router = useRouter();
  const isNew = !route;

  const [name, setName] = useState(route?.name ?? '');
  const [code, setCode] = useState(route?.code ?? '');
  const [defaultDriverName, setDefaultDriverName] = useState(route?.defaultDriverName ?? '');
  const [active, setActive] = useState(route?.active ?? true);
  const [customers, setCustomers] = useState<DeliveryRouteCustomer[]>(route?.customers ?? []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    setSuccess(false);
    setSaveError(null);

    const payload: CreateDeliveryRouteRequest & UpdateDeliveryRouteRequest = {
      name: name.trim(),
      code: code.trim() || undefined,
      defaultDriverName: defaultDriverName.trim() || undefined,
      active,
    };

    try {
      if (isNew) {
        const created = await adminDeliveryRoutesApi.create(payload);
        router.push(`/delivery-routes/${created.id}/edit`);
      } else {
        await adminDeliveryRoutesApi.update(route.id, payload);
        setSuccess(true);
      }
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!route) return;
    setIsDeleting(true);
    try {
      await adminDeliveryRoutesApi.delete(route.id);
      router.push('/delivery-routes');
    } finally {
      setIsDeleting(false);
    }
  }

  const actions: ActionItem[] = [
    {
      key: 'save',
      label: isNew ? 'Create route' : 'Save changes',
      tone: 'primary',
      type: 'submit',
      disabled: !name.trim(),
      loading: isSubmitting,
      loadingLabel: 'Saving…',
    },
    {
      key: 'back',
      label: 'Back',
      onClick: () => router.push('/delivery-routes'),
    },
    ...(!isNew
      ? ([
          {
            key: 'delete',
            label: 'Delete route',
            tone: 'danger',
            dangerZone: true,
            loading: isDeleting,
            loadingLabel: 'Deleting…',
            onClick: handleDelete,
            confirm: {
              description: 'Deactivates this route. Customers assigned to it will need a new default route before their orders auto-allocate again.',
              prompt: 'Are you sure?',
              confirmLabel: 'Yes, delete',
            },
          },
        ] satisfies ActionItem[])
      : []),
  ];

  return (
    <form onSubmit={handleSubmit}>
      <DetailPageHeader
        backHref="/delivery-routes"
        backLabel="Delivery Routes"
        heading={isNew ? 'New delivery route' : `${route!.name}${route!.customers.length ? ` (${route!.customers.length} customers)` : ''}`}
        headingStyle={isNew ? 'accent' : 'plain'}
      />
      <DetailPageLayout
        sidebar={
          <DetailActionsPanel
            layout="sidebar"
            actions={actions}
            banner={{ success: success ? 'Saved' : null, error: saveError }}
          />
        }
      >
        <FormCard title="Route details">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <TextInput
                id="name"
                placeholder="e.g. Yorkshire"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <FieldLabel htmlFor="code">Code (optional)</FieldLabel>
              <TextInput
                id="code"
                placeholder="e.g. YKS"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="defaultDriverName">Default driver (optional)</FieldLabel>
              <TextInput
                id="defaultDriverName"
                placeholder="e.g. Dave Walsh"
                value={defaultDriverName}
                onChange={(e) => setDefaultDriverName(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted">
                Used when a dated run is created. It can be changed for an individual day.
              </p>
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm text-text">Active</span>
              </label>
            </div>
          </div>
        </FormCard>

        {!isNew && (
          <FormCard title="Customer assignment">
            <RouteCustomerAssignmentPanel
              routeId={route!.id}
             
              customers={customers}
              onCustomersChange={setCustomers}
            />
          </FormCard>
        )}
      </DetailPageLayout>
    </form>
  );
}
