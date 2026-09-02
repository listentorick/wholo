'use client';

import { useAuth } from '@/lib/auth-context';
import { CatalogueForm } from '@/components/catalogues/CatalogueForm';

export default function NewCataloguePage() {
  const { accessToken } = useAuth();

  return <CatalogueForm mode="create" token={accessToken ?? ''} />;
}
