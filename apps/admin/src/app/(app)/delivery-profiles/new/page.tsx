'use client';

import { useAuth } from '@/lib/auth-context';
import { DeliveryProfileForm } from '@/components/delivery-profiles/DeliveryProfileForm';

export default function NewDeliveryProfilePage() {
  const { accessToken } = useAuth();

  if (!accessToken) return null;

  return <DeliveryProfileForm />;
}
