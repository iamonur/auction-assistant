interface FilterChipProps {
  label: string
  active: boolean
  onClick: () => void
}

export default function FilterChip({ label, active, onClick }: FilterChipProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-gold/40 bg-gold/15 text-gold'
          : 'border-surface-border text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
      }`}
    >
      {label}
    </button>
  )
}
