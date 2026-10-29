import { redirect } from 'next/navigation';

// The product page is tabbed now; old /edit links land on it.
export default async function EditProductRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/products/${id}`);
}
