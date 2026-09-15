import { AlertTriangle, Loader2, PackageOpen } from 'lucide-react'

export function LoadingState({ label = 'Loading…' }: { label?: string }): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 py-24 text-zinc-500">
      <Loader2 size={18} className="animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function ErrorState({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-profit-negative">
      <AlertTriangle size={22} />
      <p className="text-sm">{message}</p>
    </div>
  )
}

export function EmptyState({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-zinc-500">
      <PackageOpen size={22} />
      <p className="text-sm">{message}</p>
    </div>
  )
}
