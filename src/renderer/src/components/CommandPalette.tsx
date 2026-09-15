import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { formatCopperAsGold } from '../lib/gold'
import { rarityTextClass } from '../lib/rarity'
import { npcRankLabel } from '../lib/npcRank'
import type { ItemSearchResult, MobSearchResult } from '@shared/types'

interface CommandPaletteProps {
  onClose: () => void
  onOpenItem: (itemId: number) => void
  onOpenMob: (creatureId: number, name: string) => void
}

type ResultEntry =
  | { kind: 'item'; item: ItemSearchResult }
  | { kind: 'mob'; mob: MobSearchResult }

/** Global search palette (Cmd+K / Ctrl+K, mounted once in App.tsx) — searches items and mobs across whichever game version is active. */
export default function CommandPalette({ onClose, onOpenItem, onOpenMob }: CommandPaletteProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<ItemSearchResult[]>([])
  const [mobs, setMobs] = useState<MobSearchResult[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      setItems([])
      setMobs([])
      return
    }
    let cancelled = false
    Promise.all([window.api.items.search(trimmed), window.api.mobValue.search(trimmed)]).then(
      ([itemResults, mobResults]) => {
        if (cancelled) return
        setItems(itemResults)
        setMobs(mobResults)
        setActiveIndex(0)
      }
    )
    return () => {
      cancelled = true
    }
  }, [query])

  const results: ResultEntry[] = [
    ...items.map((item): ResultEntry => ({ kind: 'item', item })),
    ...mobs.map((mob): ResultEntry => ({ kind: 'mob', mob }))
  ]

  const selectResult = (entry: ResultEntry): void => {
    if (entry.kind === 'item') {
      onOpenItem(entry.item.itemId)
    } else {
      onOpenMob(entry.mob.creatureId, entry.mob.name)
    }
    onClose()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const active = results[activeIndex]
      if (active) selectResult(active)
    } else if (event.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 pt-[15vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="panel w-full max-w-xl overflow-hidden shadow-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
      >
        <div className="relative border-b border-surface-border">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search items and mobs…"
            className="w-full bg-transparent py-4 pl-11 pr-4 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>

        <div className="max-h-[50vh] overflow-auto">
          {query.trim().length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-zinc-600">Type to search items and mobs.</p>
          )}

          {query.trim().length > 0 && results.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-zinc-600">No matches.</p>
          )}

          {items.length > 0 && (
            <ResultSection label="Items">
              {items.map((item) => (
                <ResultRow
                  key={`item-${item.itemId}`}
                  active={results[activeIndex]?.kind === 'item' && results[activeIndex].item.itemId === item.itemId}
                  onClick={() => selectResult({ kind: 'item', item })}
                >
                  <span className={`font-medium ${rarityTextClass(item.quality)}`}>{item.itemName}</span>
                  <span className="text-xs text-zinc-500">
                    {item.currentPrice !== null ? formatCopperAsGold(item.currentPrice) : '—'}
                  </span>
                </ResultRow>
              ))}
            </ResultSection>
          )}

          {mobs.length > 0 && (
            <ResultSection label="Mobs">
              {mobs.map((mob) => (
                <ResultRow
                  key={`mob-${mob.creatureId}`}
                  active={results[activeIndex]?.kind === 'mob' && results[activeIndex].mob.creatureId === mob.creatureId}
                  onClick={() => selectResult({ kind: 'mob', mob })}
                >
                  <span className="font-medium text-zinc-200">{mob.name}</span>
                  <span className="text-xs text-zinc-500">{npcRankLabel(mob.npcRank)}</span>
                </ResultRow>
              ))}
            </ResultSection>
          )}
        </div>

        <div className="border-t border-surface-border px-4 py-2 text-[11px] text-zinc-600">
          ↑↓ to navigate · Enter to select · Esc to close
        </div>
      </div>
    </div>
  )
}

function ResultSection({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <p className="px-4 pt-3 text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="py-1">{children}</div>
    </div>
  )
}

function ResultRow({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors ${
        active ? 'bg-gold/10' : 'hover:bg-surface-raised/50'
      }`}
    >
      {children}
    </button>
  )
}
