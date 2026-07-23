export function TextInput({
  id,
  placeholder,
  disabled,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      id={id}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text placeholder-muted/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ''}`}
      {...props}
    />
  );
}
