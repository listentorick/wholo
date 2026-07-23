export function Textarea({
  id,
  placeholder,
  disabled,
  rows = 3,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      id={id}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows}
      className={`w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text placeholder-muted/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 resize-none ${className ?? ''}`}
      {...props}
    />
  );
}
