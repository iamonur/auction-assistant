import { useEffect, useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import type { ItemSearchResult, NotableLootSuggestion } from '@shared/types'
import { formatCopperAsGold } from '../lib/gold'

interface DungeonEntryFormProps {
  dungeonRunId: number
  onAdded: () => void
}

const SEARCH_DEBOUNCE_MS = 250

export default function DungeonEntryForm({ dungeonRunId, onAdded }: DungeonEntryFormProps): React.JSX.Element {
  const [itemQuery, setItemQuery] = useState('')
  const [matchedItem, setMatchedItem] = useState<ItemSearchResult | null>(null)
  const [suggestions, setSuggestions] = useState<ItemSearchResult[]>([])
  const [lootSuggestions, setLootSuggestions] = useState<NotableLootSuggestion[]>([])
  const [mobCount, setMobCount] = useState(1)
  const [dropChancePercent, setDropChancePercent] = useState(0.1)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (matchedItem && matchedItem.itemName === itemQuery) return
    if (itemQuery.trim().length < 2) {
      setSuggestions([])
      return
    }
    const timeout = setTimeout(() => {
      window.api.items.search(itemQuery).then(setSuggestions)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [itemQuery, matchedItem])

  useEffect(() => {
    if (!matchedItem) {
      setLootSuggestions([])
      return
    }
    let cancelled = false
    window.api.dungeon.lootSuggestions(matchedItem.itemId).then((result) => {
      if (!cancelled) setLootSuggestions(result)
    })
    return () => {
      cancelled = true
    }
  }, [matchedItem])

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (itemQuery.trim().length === 0) return
    setSubmitting(true)
    try {
      await window.api.dungeon.upsertEntry({
        dungeonRunId,
        itemId: matchedItem?.itemId ?? null,
        itemNameOverride: matchedItem ? null : itemQuery.trim(),
        mobCount,
        dropChancePercent,
        avgDropCount: 1
      })
      setItemQuery('')
      setMatchedItem(null)
      setSuggestions([])
      setMobCount(1)
      setDropChancePercent(0.1)
      onAdded()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="panel space-y-3 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">Add drop entry</p>

      <div className="relative">
        <input
          type="text"
          value={itemQuery}
          onChange={(event) => {
            setItemQuery(event.target.value)
            setMatchedItem(null)
          }}
          placeholder="Item name (e.g. Robe of the Archmage)"
          className="w-full rounded-md border border-surface-border bg-surface-panel px-3 py-2 text-sm text-zinc-200 focus:border-gold/50 focus:outline-none"
        />
        {suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-surface-border bg-surface-panel shadow-panel">
            {suggestions.map((suggestion) => (
              <li key={suggestion.itemId}>
                <button
                  type="button"
                  onClick={() => {
                    setMatchedItem(suggestion)
                    setItemQuery(suggestion.itemName)
                    setSuggestions([])
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-zinc-200 hover:bg-surface-raised"
                >
                  <span>{suggestion.itemName}</span>
                  <span className="text-xs text-zinc-500">{formatCopperAsGold(suggestion.currentPrice)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lootSuggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-zinc-500">
            <Sparkles size={12} className="text-gold" /> Suggested from real drop data
          </p>
          <div className="flex flex-wrap gap-1.5">
            {lootSuggestions.map((suggestion) => (
              <button
                key={suggestion.creatureId}
                type="button"
                onClick={() => {
                  setMobCount(suggestion.spawnCount > 0 ? suggestion.spawnCount : 1)
                  setDropChancePercent(suggestion.chancePercent)
                }}
                className="rounded-full border border-surface-border bg-surface-panel px-2.5 py-1 text-xs text-zinc-300 transition-colors hover:border-gold/40 hover:text-gold"
                title="Fill mob count & drop chance from this suggestion"
              >
                {suggestion.creatureName} — {suggestion.chancePercent}%
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-zinc-500">
          Mob count
          <input
            type="number"
            min={0}
            value={mobCount}
            onChange={(event) => setMobCount(Number(event.target.value))}
            className="mt-1 w-full rounded-md border border-surface-border bg-surface-panel px-3 py-2 text-sm text-zinc-200 focus:border-gold/50 focus:outline-none"
          />
        </label>
        <label className="text-xs text-zinc-500">
          Drop chance %
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={dropChancePercent}
            onChange={(event) => setDropChancePercent(Number(event.target.value))}
            className="mt-1 w-full rounded-md border border-surface-border bg-surface-panel px-3 py-2 text-sm text-zinc-200 focus:border-gold/50 focus:outline-none"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={submitting || itemQuery.trim().length === 0}
        className="flex items-center gap-2 rounded-md border border-gold/30 bg-gold/10 px-3 py-2 text-sm font-medium text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={15} /> Add Entry
      </button>
    </form>
  )
}
