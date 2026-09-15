import Modal from './Modal'
import { EmptyState, ErrorState, LoadingState } from './StateViews'
import { useAsyncData } from '../hooks/useAsyncData'
import { useItemDetailModal } from '../hooks/useItemDetailModal'
import { formatCopperAsGold } from '../lib/gold'
import { rarityTextClass } from '../lib/rarity'

interface MobDropTableModalProps {
  creatureId: number
  mobName: string
  onClose: () => void
}

export default function MobDropTableModal({ creatureId, mobName, onClose }: MobDropTableModalProps): React.JSX.Element {
  const { data, loading, error } = useAsyncData(() => window.api.mobValue.dropTable(creatureId), [creatureId])
  const { openItem, itemDetailModal } = useItemDetailModal()

  return (
    <Modal title={mobName} subtitle="Drop table" onClose={onClose}>
      {loading && <LoadingState label="Loading drop table…" />}
      {error && <ErrorState message={error} />}
      {!loading && !error && (!data || data.length === 0) && (
        <EmptyState message="No known loot table for this mob." />
      )}

      {!loading && !error && data && data.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-surface-panel text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Chance</th>
              <th className="px-4 py-3 font-medium">Qty</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Volume</th>
            </tr>
          </thead>
          <tbody>
            {data.map((entry) => {
              const illiquid = entry.volume === 0
              return (
                <tr key={entry.itemId} className="border-b border-surface-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openItem(entry.itemId)}
                      className={`font-medium hover:underline ${rarityTextClass(entry.quality)}`}
                    >
                      {entry.itemName}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{entry.chancePercent.toFixed(2)}%</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {entry.minCount === entry.maxCount ? entry.minCount : `${entry.minCount}–${entry.maxCount}`}
                  </td>
                  <td className={`px-4 py-3 ${illiquid ? 'text-zinc-600' : 'text-zinc-200'}`}>
                    {entry.price !== null ? formatCopperAsGold(entry.price) : '—'}
                  </td>
                  <td
                    className={`px-4 py-3 ${illiquid ? 'text-profit-negative/70' : 'text-zinc-400'}`}
                    title={illiquid ? 'No recent sales — treat this price as a low-confidence estimate.' : undefined}
                  >
                    {entry.volume.toLocaleString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {itemDetailModal}
    </Modal>
  )
}
