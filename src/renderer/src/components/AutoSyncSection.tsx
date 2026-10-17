import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { useAsyncData } from '../hooks/useAsyncData'
import { LoadingState } from './StateViews'
import FormField from './FormField'
import type { AppSettings } from '@shared/types'

const INTERVAL_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 30, label: 'Every 30 minutes' },
  { minutes: 60, label: 'Every hour' },
  { minutes: 120, label: 'Every 2 hours' },
  { minutes: 240, label: 'Every 4 hours' },
  { minutes: 360, label: 'Every 6 hours' }
]

/**
 * Runs the same sync as the manual "Sync AH Data" button, but on a
 * timer while the app is open, so tabs stay current without the user
 * remembering to click anything — see main/autoSync.ts. Only ever syncs
 * whichever game version is currently active, same scope as the manual
 * button, so this section edits that version's own settings like the
 * rest of the Settings page.
 */
export default function AutoSyncSection(): React.JSX.Element {
  const { data: initialSettings, loading } = useAsyncData(() => window.api.settings.get(), [])
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    setSettings(initialSettings ?? null)
  }, [initialSettings])

  if (loading || !settings) return <LoadingState />

  const updateAndSave = (patch: Partial<AppSettings>): void => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
    void window.api.settings.set(patch)
  }

  return (
    <div className="panel space-y-4 p-6">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
        <Clock size={13} />
        Scheduled Sync
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={settings.autoSyncEnabled}
          onChange={(event) => updateAndSave({ autoSyncEnabled: event.target.checked })}
          className="mt-1 h-3.5 w-3.5 rounded border-surface-border bg-surface-panel accent-gold"
        />
        <span>
          <span className="block text-sm font-medium text-zinc-200">Sync automatically while the app is open</span>
          <span className="block text-xs text-zinc-500">
            Keeps prices current in the background, without needing to click &quot;Sync AH Data&quot; yourself.
          </span>
        </span>
      </label>

      <FormField label="Interval">
        <select
          value={settings.autoSyncIntervalMinutes}
          disabled={!settings.autoSyncEnabled}
          onChange={(event) => updateAndSave({ autoSyncIntervalMinutes: Number(event.target.value) })}
          className="input disabled:cursor-not-allowed disabled:opacity-50"
        >
          {INTERVAL_OPTIONS.map((option) => (
            <option key={option.minutes} value={option.minutes}>
              {option.label}
            </option>
          ))}
        </select>
      </FormField>
    </div>
  )
}
