export function SaveButton({ isSubmitting, disabled = false }: { isSubmitting: boolean; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={isSubmitting || disabled}
      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isSubmitting ? 'Saving…' : 'Save changes'}
    </button>
  );
}
