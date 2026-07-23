interface FieldLabelProps {
  htmlFor?: string;
  children: React.ReactNode;
}

export function FieldLabel({ htmlFor, children }: FieldLabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5"
    >
      {children}
    </label>
  );
}
