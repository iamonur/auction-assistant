import { useState } from 'react'
import { Download, Plus, Trash2 } from 'lucide-react'
import TopBar from '../components/TopBar'
import DungeonEntryForm from '../components/DungeonEntryForm'
import ImportZoneModal from '../components/ImportZoneModal'
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews'
import { useAsyncData } from '../hooks/useAsyncData'
import { formatCopperAsGold } from '../lib/gold'

export default function DungeonSelectingPage(): React.JSX.Element {
  const { data: dungeons, loading, error, reload } = useAsyncData(() => window.api.dungeon.list(), [])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [newName, setNewName] = useState('')
  const [importModalOpen, setImportModalOpen] = useState(false)

  const selected = dungeons?.find((dungeon) => dungeon.id === selectedId) ?? dungeons?.[0] ?? null

  const handleCreate = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (newName.trim().length === 0) return
    const created = await window.api.dungeon.create(newName.trim(), null)
    setNewName('')
    reload()
    setSelectedId(created.id)
  }

  const handleDelete = async (id: number): Promise<void> => {
    await window.api.dungeon.delete(id)
    if (selectedId === id) setSelectedId(null)
    reload()
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar title="Dungeon Selecting" />

      <div className="flex-1 overflow-hidden px-6 py-4">
        {loading && <LoadingState label="Loading dungeon runs…" />}
        {error && <ErrorState message={error} />}

        {!loading && !error && (
          <div className="flex h-full gap-4">
            <aside className="panel flex w-72 shrink-0 flex-col overflow-hidden">
              <div className="border-b border-surface-border p-3">
                <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Your dungeons</p>
                <form onSubmit={(event) => void handleCreate(event)} className="flex gap-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder="New dungeon name"
                    className="min-w-0 flex-1 rounded-md border border-surface-border bg-surface-panel px-2 py-1.5 text-xs text-zinc-200 focus:border-gold/50 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="flex items-center justify-center rounded-md border border-gold/30 bg-gold/10 px-2 text-gold hover:bg-gold/20"
                  >
                    <Plus size={14} />
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => setImportModalOpen(true)}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-surface-border px-2 py-1.5 text-xs text-zinc-400 transition-colors hover:border-gold/40 hover:text-gold"
                >
                  <Download size={13} /> Import from Zone
                </button>
              </div>

              <div className="flex-1 overflow-auto">
                {dungeons && dungeons.length === 0 && (
                  <p className="p-4 text-xs text-zinc-500">
                    No dungeons yet. Create one above, then add each notable drop below.
                  </p>
                )}
                {dungeons?.map((dungeon) => (
                  <button
                    key={dungeon.id}
                    type="button"
                    onClick={() => setSelectedId(dungeon.id)}
                    className={`flex w-full items-center justify-between border-b border-surface-border/60 px-4 py-3 text-left text-sm transition-colors hover:bg-surface-raised ${
                      selected?.id === dungeon.id ? 'bg-surface-raised text-gold' : 'text-zinc-300'
                    }`}
                  >
                    <span className="truncate">{dungeon.name}</span>
                    <span className="text-xs text-zinc-500">{formatCopperAsGold(dungeon.totalExpectedValue)}</span>
                  </button>
                ))}
              </div>
            </aside>

            <section className="flex-1 overflow-auto">
              {!selected && (
                <EmptyState message="Select or create a dungeon to build its expected-value model." />
              )}

              {selected && (
                <div className="space-y-4">
                  <div className="panel flex items-center justify-between p-4">
                    <div>
                      <p className="font-display text-lg font-semibold text-zinc-100">{selected.name}</p>
                      <p className="text-xs text-zinc-500">{selected.entries.length} tracked drops</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-wide text-zinc-500">Expected run value</p>
                        <p className="text-lg font-semibold text-profit-positive">
                          {formatCopperAsGold(selected.totalExpectedValue)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDelete(selected.id)}
                        className="rounded-md border border-profit-negative/30 p-2 text-profit-negative hover:bg-profit-negative/10"
                        aria-label="Delete dungeon"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {selected.entries.length > 0 && (
                    <div className="panel overflow-hidden">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-surface-border bg-surface-panel text-left text-xs uppercase tracking-wide text-zinc-500">
                            <th className="px-4 py-3 font-medium">Item</th>
                            <th className="px-4 py-3 font-medium">Mob Count</th>
                            <th className="px-4 py-3 font-medium">Drop %</th>
                            <th className="px-4 py-3 font-medium">Avg Qty</th>
                            <th className="px-4 py-3 font-medium">Current Price</th>
                            <th className="px-4 py-3 font-medium">Expected Value</th>
                            <th className="px-4 py-3" />
                          </tr>
                        </thead>
                        <tbody>
                          {selected.entries.map((entry) => (
                            <tr key={entry.id} className="border-b border-surface-border/60 last:border-0">
                              <td className="px-4 py-3 text-zinc-200">{entry.resolvedItemName}</td>
                              <td className="px-4 py-3 text-zinc-400">{entry.mobCount}</td>
                              <td className="px-4 py-3 text-zinc-400">{entry.dropChancePercent}%</td>
                              <td className="px-4 py-3 text-zinc-400">{entry.avgDropCount}</td>
                              <td className="px-4 py-3 text-zinc-400">
                                {entry.currentPrice !== null ? formatCopperAsGold(entry.currentPrice) : 'No AH data'}
                              </td>
                              <td className="px-4 py-3 font-medium text-profit-positive">
                                {entry.expectedValue !== null ? formatCopperAsGold(entry.expectedValue) : '—'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void window.api.dungeon.deleteEntry(entry.id).then(reload)
                                  }
                                  className="text-zinc-500 hover:text-profit-negative"
                                  aria-label="Remove entry"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <DungeonEntryForm dungeonRunId={selected.id} onAdded={reload} />
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {importModalOpen && (
        <ImportZoneModal
          onClose={() => setImportModalOpen(false)}
          onImported={(runId) => {
            reload()
            setSelectedId(runId)
          }}
        />
      )}
    </div>
  )
}
