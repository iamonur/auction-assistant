import { NavLink } from 'react-router-dom'
import {
  Compass,
  Crosshair,
  GraduationCap,
  Hammer,
  HeartHandshake,
  Map,
  PawPrint,
  Pickaxe,
  Search,
  Settings,
  Skull,
  TrendingDown
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import GameVersionSwitcher from './GameVersionSwitcher'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

interface SidebarProps {
  onOpenSearch: () => void
}

const PRIMARY_NAV: NavItem[] = [
  { to: '/crafting-sniper', label: 'Crafting Sniper', icon: Hammer },
  { to: '/gathering', label: 'Gathering Profitability', icon: Pickaxe },
  { to: '/pet-farming', label: 'Battle Pet Farming', icon: PawPrint },
  { to: '/farming-routes', label: 'Farming Route Helper', icon: Map },
  { to: '/anomalies', label: 'Investment & Anomalies', icon: TrendingDown },
  { to: '/dungeons', label: 'Dungeon Selecting', icon: Skull },
  { to: '/mob-value', label: 'Mob Value', icon: Crosshair },
  { to: '/zone-value', label: 'Zone Value', icon: Compass },
  { to: '/leveling-planner', label: 'Leveling Planner', icon: GraduationCap }
]

const IS_MAC = navigator.userAgent.includes('Mac')

export default function Sidebar({ onOpenSearch }: SidebarProps): React.JSX.Element {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-surface-border bg-surface-raised">
      <div className="flex items-center gap-2 px-5 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gold/10 text-gold shadow-gold-glow">
          <Hammer size={18} />
        </div>
        <div>
          <p className="font-display text-sm font-semibold leading-tight tracking-wide text-gold">
            Crafting & Auction
          </p>
          <p className="text-xs text-zinc-500">Classic Assistant</p>
        </div>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex w-full items-center gap-2 rounded-md border border-surface-border bg-surface-panel px-3 py-2 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
        >
          <Search size={13} />
          <span className="flex-1 text-left">Search…</span>
          <span className="rounded border border-surface-border px-1.5 py-0.5 text-[10px] text-zinc-500">
            {IS_MAC ? '⌘K' : 'Ctrl+K'}
          </span>
        </button>
      </div>

      <GameVersionSwitcher />

      <nav className="flex-1 space-y-1 px-3">
        {PRIMARY_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
          >
            <Icon size={17} strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="space-y-1 border-t border-surface-border px-3 py-3">
        <NavLink to="/support" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
          <HeartHandshake size={17} strokeWidth={2} />
          <span>Support Development</span>
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
          <Settings size={17} strokeWidth={2} />
          <span>Settings</span>
        </NavLink>
      </div>
    </aside>
  )
}
