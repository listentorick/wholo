export function SaveBanner({ success, error }: { success: boolean; error: string | null }) {
  if (success) {
    return <p className="text-xs font-medium text-green-600">Saved</p>;
  }
  if (error) {
    return <p className="text-xs font-medium text-red-500">{error}</p>;
  }
  return null;
}
