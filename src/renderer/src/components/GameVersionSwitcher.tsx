import { useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { GAME_VERSIONS, GAME_VERSION_LABELS } from '@shared/gameVersions'
import type { GameVersion } from '@shared/types'
import { useAsyncData } from '../hooks/useAsyncData'

/**
 * Switches which game version's database + settings the whole app is
 * pointed at. Each version is a fully separate SQLite file (see
 * main/db/index.ts), so switching reloads the renderer outright rather
 * than trying to invalidate every page's cached state individually.
 */
export default function GameVersionSwitcher(): React.JSX.Element {
  const { data: current } = useAsyncData(() => window.api.gameVersion.get(), [])
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  const handleSelect = async (gameVersion: GameVersion): Promise<void> => {
    if (gameVersion === current) {
      setOpen(false)
      return
    }
    setSwitching(true)
    await window.api.gameVersion.set(gameVersion)
    window.location.reload()
  }

  return (
    <div className="relative px-3 pb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!current || switching}
        className="flex w-full items-center justify-between rounded-md border border-surface-border bg-surface-panel px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex items-center gap-2">
          {switching && <Loader2 size={12} className="animate-spin" />}
          {current ? GAME_VERSION_LABELS[current] : 'Loading…'}
        </span>
        <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open && !switching && (
        <ul className="absolute inset-x-3 z-10 mt-1 overflow-hidden rounded-md border border-surface-border bg-surface-panel shadow-panel">
          {GAME_VERSIONS.map((version) => (
            <li key={version}>
              <button
                type="button"
                onClick={() => void handleSelect(version)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-surface-raised ${
                  version === current ? 'text-gold' : 'text-zinc-300'
                }`}
              >
                {GAME_VERSION_LABELS[version]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
