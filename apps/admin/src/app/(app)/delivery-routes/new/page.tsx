'use client';

import { useAuth } from '@/lib/auth-context';
import { DeliveryRouteForm } from '@/components/delivery-routes/DeliveryRouteForm';

export default function NewDeliveryRoutePage() {
  const { accessToken } = useAuth();

  if (!accessToken) return null;

  return <DeliveryRouteForm token={accessToken} />;
}
