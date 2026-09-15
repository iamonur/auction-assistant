import { useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import Modal from './Modal'
import { EmptyState, LoadingState } from './StateViews'
import { useAsyncData } from '../hooks/useAsyncData'
import type { InstanceZoneOption } from '@shared/types'

interface ImportZoneModalProps {
  onClose: () => void
  onImported: (runId: number) => void
}

/** Lets the user pick a real dungeon/raid to bulk-fill a new dungeon run from actual mob_catalog/mob_loot data — see main/queries/dungeon.ts#importDungeonFromZone. */
export default function ImportZoneModal({ onClose, onImported }: ImportZoneModalProps): React.JSX.Element {
  const { data: zones, loading } = useAsyncData(() => window.api.dungeon.listInstanceZones(), [])
  const [search, setSearch] = useState('')
  const [importingMapId, setImportingMapId] = useState<number | null>(null)

  const needle = search.trim().toLowerCase()
  const filtered = (zones ?? []).filter((zone) => zone.zoneName.toLowerCase().includes(needle))
  const raids = filtered.filter((zone) => zone.zoneType === 'raid')
  const dungeons = filtered.filter((zone) => zone.zoneType === 'dungeon')

  const handleImport = async (zone: InstanceZoneOption): Promise<void> => {
    setImportingMapId(zone.mapId)
    try {
      const run = await window.api.dungeon.importFromZone(zone.mapId, zone.zoneName)
      onImported(run.id)
      onClose()
    } finally {
      setImportingMapId(null)
    }
  }

  return (
    <Modal title="Import from Zone" subtitle="Pre-fill a run from real drop-table data" onClose={onClose}>
      <div className="border-b border-surface-border p-4">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search dungeons and raids…"
            autoFocus
            className="w-full rounded-md border border-surface-border bg-surface-panel py-1.5 pl-8 pr-3 text-sm text-zinc-200 focus:border-gold/50 focus:outline-none"
          />
        </div>
        <p className="mt-2 text-xs text-zinc-600">
          Imports every rare-elite/boss drop with a current, liquid price — trash loot and untradeable items are left
          out to keep the run readable. You can still add anything by hand afterward.
        </p>
      </div>

      <div className="max-h-[50vh] overflow-auto">
        {loading && <LoadingState label="Loading zones…" />}
        {!loading && filtered.length === 0 && <EmptyState message="No zones found." />}

        {!loading && raids.length > 0 && (
          <ZoneSection label="Raids" zones={raids} importingMapId={importingMapId} onImport={handleImport} />
        )}
        {!loading && dungeons.length > 0 && (
          <ZoneSection label="Dungeons" zones={dungeons} importingMapId={importingMapId} onImport={handleImport} />
        )}
      </div>
    </Modal>
  )
}

function ZoneSection({
  label,
  zones,
  importingMapId,
  onImport
}: {
  label: string
  zones: InstanceZoneOption[]
  importingMapId: number | null
  onImport: (zone: InstanceZoneOption) => void
}): React.JSX.Element {
  return (
    <div>
      <p className="px-4 pt-3 text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="py-1">
        {zones.map((zone) => (
          <button
            key={zone.mapId}
            type="button"
            disabled={importingMapId !== null}
            onClick={() => onImport(zone)}
            className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-surface-raised/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span>{zone.zoneName}</span>
            {importingMapId === zone.mapId && <Loader2 size={14} className="animate-spin text-gold" />}
          </button>
        ))}
      </div>
    </div>
  )
}
