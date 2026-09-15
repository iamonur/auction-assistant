interface FormFieldProps {
  label: string
  hint?: string
  children: React.ReactNode
}

export default function FormField({ label, hint, children }: FormFieldProps): React.JSX.Element {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-600">{hint}</span>}
    </label>
  )
}
