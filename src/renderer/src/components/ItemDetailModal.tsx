import Modal from './Modal'
import { EmptyState, ErrorState, LoadingState } from './StateViews'
import { useAsyncData } from '../hooks/useAsyncData'
import { formatCopperAsGold } from '../lib/gold'
import { rarityLabel, rarityTextClass } from '../lib/rarity'
import type { ItemDetail } from '@shared/types'

interface ItemDetailModalProps {
  itemId: number
  onClose: () => void
}

function humanizeCategory(category: string): string {
  return category.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

export default function ItemDetailModal({ itemId, onClose }: ItemDetailModalProps): React.JSX.Element {
  const { data, loading, error } = useAsyncData(() => window.api.items.detail(itemId), [itemId])

  return (
    <Modal title={data ? data.name : 'Item'} subtitle={data ? rarityLabel(data.quality) : undefined} onClose={onClose}>
      {loading && <LoadingState label="Loading item details…" />}
      {error && <ErrorState message={error} />}
      {!loading && !error && !data && <EmptyState message="No data found for this item." />}

      {!loading && !error && data && <ItemDetailBody item={data} />}
    </Modal>
  )
}

function ItemDetailBody({ item }: { item: ItemDetail }): React.JSX.Element {
  const illiquid = item.volume === 0
  const hasAnySource =
    item.droppedBy.length > 0 ||
    item.skinnedFrom.length > 0 ||
    item.gatheredFrom.length > 0 ||
    item.usedInRecipes.length > 0 ||
    item.craftedBy.length > 0

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`font-display text-sm font-semibold ${rarityTextClass(item.quality)}`}>{item.name}</span>
        <span className="rounded-full border border-surface-border px-2 py-0.5 text-[11px] text-zinc-400">
          {humanizeCategory(item.category)}
        </span>
        {item.itemLevel !== null && (
          <span className="rounded-full border border-surface-border px-2 py-0.5 text-[11px] text-zinc-400">
            Item Level {item.itemLevel}
          </span>
        )}
        {item.isBoe && (
          <span className="rounded-full bg-rarity-rare/10 px-2 py-0.5 text-[11px] text-rarity-rare">BoE</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <Stat label="Current Price" value={item.price !== null ? formatCopperAsGold(item.price) : '—'} muted={illiquid} />
        <Stat
          label="Volume"
          value={item.volume.toLocaleString()}
          muted={illiquid}
          title={illiquid ? 'No recent sales — treat this price as a low-confidence estimate.' : undefined}
        />
        <Stat label="Vendor Price" value={item.vendorPrice !== null ? formatCopperAsGold(item.vendorPrice) : '—'} />
      </div>

      {!hasAnySource && <p className="text-xs text-zinc-600">No known drop, gather, or recipe sources for this item.</p>}

      {item.droppedBy.length > 0 && (
        <Section title="Dropped By">
          <ListTable
            columns={['Mob', 'Chance', 'Qty']}
            rows={item.droppedBy.map((drop) => [
              drop.name,
              `${drop.chancePercent.toFixed(2)}%`,
              drop.minCount === drop.maxCount ? String(drop.minCount) : `${drop.minCount}–${drop.maxCount}`
            ])}
          />
        </Section>
      )}

      {item.skinnedFrom.length > 0 && (
        <Section title="Skinned From">
          <ListTable
            columns={['Creature', 'Chance']}
            rows={item.skinnedFrom.map((drop) => [drop.name, `${drop.chancePercent.toFixed(2)}%`])}
          />
        </Section>
      )}

      {item.gatheredFrom.length > 0 && (
        <Section title="Gathered From">
          <ListTable
            columns={['Node', 'Type', 'Spawns']}
            rows={item.gatheredFrom.map((node) => [node.nodeName, node.kind, node.spawnCount.toLocaleString()])}
          />
        </Section>
      )}

      {item.craftedBy.length > 0 && (
        <Section title="Crafted By">
          <ListTable
            columns={['Recipe', 'Profession', 'Skill Req', 'Craft Cost']}
            rows={item.craftedBy.map((recipe) => [
              recipe.recipeName,
              recipe.profession,
              String(recipe.skillLevelReq),
              recipe.craftCost !== null ? formatCopperAsGold(recipe.craftCost) : 'Missing price data'
            ])}
          />
        </Section>
      )}

      {item.usedInRecipes.length > 0 && (
        <Section title="Used In Recipes">
          <ListTable
            columns={['Recipe', 'Profession', 'Qty']}
            rows={item.usedInRecipes.map((recipe) => [recipe.recipeName, recipe.profession, String(recipe.quantity)])}
          />
        </Section>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  muted,
  title
}: {
  label: string
  value: string
  muted?: boolean
  title?: string
}): React.JSX.Element {
  return (
    <div title={title}>
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={muted ? 'text-zinc-600' : 'text-zinc-200'}>{value}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">{title}</p>
      {children}
    </div>
  )
}

function ListTable({ columns, rows }: { columns: string[]; rows: string[][] }): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-md border border-surface-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-surface-border bg-surface-panel text-left text-[11px] uppercase tracking-wide text-zinc-500">
            {columns.map((col) => (
              <th key={col} className="px-3 py-2 font-medium">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-surface-border/60 last:border-0">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2 text-zinc-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
