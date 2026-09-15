import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { useAsyncData } from '../hooks/useAsyncData'

interface TopBarProps {
  title: string
  onSynced?: () => void
}

export default function TopBar({ title, onSynced }: TopBarProps): React.JSX.Element {
  const { data: lastSync, reload: reloadLastSync } = useAsyncData(() => window.api.ah.lastSync(), [])
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{ text: string; success: boolean } | null>(null)

  const handleSync = async (): Promise<void> => {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const result = await window.api.ah.fetchData()
      setSyncMessage({ text: result.message, success: result.success })
      if (result.success) {
        reloadLastSync()
        onSynced?.()
      }
    } catch (error) {
      setSyncMessage({
        text: error instanceof Error ? error.message : 'Sync failed.',
        success: false
      })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <header className="flex items-center justify-between border-b border-surface-border bg-surface px-6 py-4">
      <div>
        <h1 className="font-display text-lg font-semibold text-zinc-100">{title}</h1>
        <p className="text-xs text-zinc-500">
          {lastSync ? `Last AH sync: ${new Date(lastSync).toLocaleString()}` : 'No auction data synced yet'}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {syncMessage && (
          <span className={`text-xs ${syncMessage.success ? 'text-profit-positive' : 'text-profit-negative'}`}>
            {syncMessage.text}
          </span>
        )}
        <button
          type="button"
          onClick={() => void handleSync()}
          disabled={syncing}
          className="flex items-center gap-2 rounded-md border border-gold/30 bg-gold/10 px-3 py-2 text-sm font-medium text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {syncing ? 'Syncing…' : 'Sync AH Data'}
        </button>
      </div>
    </header>
  )
}
