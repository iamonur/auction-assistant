import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import FirstRunModal from './components/FirstRunModal'
import CommandPalette from './components/CommandPalette'
import ItemDetailModal from './components/ItemDetailModal'
import MobDropTableModal from './components/MobDropTableModal'
import { useAsyncData } from './hooks/useAsyncData'
import CraftingSniperPage from './pages/CraftingSniperPage'
import GatheringProfitabilityPage from './pages/GatheringProfitabilityPage'
import PetFarmingPage from './pages/PetFarmingPage'
import FarmingRouteHelperPage from './pages/FarmingRouteHelperPage'
import MarketAnomaliesPage from './pages/MarketAnomaliesPage'
import DungeonSelectingPage from './pages/DungeonSelectingPage'
import MobValuePage from './pages/MobValuePage'
import ZoneValuePage from './pages/ZoneValuePage'
import LevelingPlannerPage from './pages/LevelingPlannerPage'
import SupportPage from './pages/SupportPage'
import SettingsPage from './pages/SettingsPage'

export default function App(): React.JSX.Element {
  const { data: settings } = useAsyncData(() => window.api.settings.get(), [])
  const [onboardingDismissedThisSession, setOnboardingDismissedThisSession] = useState(false)

  const showOnboarding =
    !onboardingDismissedThisSession && settings !== null && !settings.lastSyncAt && !settings.onboardingDismissed

  const dismissOnboarding = (): void => {
    setOnboardingDismissedThisSession(true)
    void window.api.settings.set({ onboardingDismissed: true })
  }

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [openItemId, setOpenItemId] = useState<number | null>(null)
  const [openMob, setOpenMob] = useState<{ creatureId: number; name: string } | null>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface text-zinc-200">
      <Sidebar onOpenSearch={() => setPaletteOpen(true)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <Routes>
          <Route path="/" element={<Navigate to="/crafting-sniper" replace />} />
          <Route path="/crafting-sniper" element={<CraftingSniperPage />} />
          <Route path="/gathering" element={<GatheringProfitabilityPage />} />
          <Route path="/pet-farming" element={<PetFarmingPage />} />
          <Route path="/farming-routes" element={<FarmingRouteHelperPage />} />
          <Route path="/anomalies" element={<MarketAnomaliesPage />} />
          <Route path="/dungeons" element={<DungeonSelectingPage />} />
          <Route path="/mob-value" element={<MobValuePage />} />
          <Route path="/zone-value" element={<ZoneValuePage />} />
          <Route path="/leveling-planner" element={<LevelingPlannerPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/crafting-sniper" replace />} />
        </Routes>
      </main>

      {showOnboarding && <FirstRunModal onDismiss={dismissOnboarding} />}

      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onOpenItem={setOpenItemId}
          onOpenMob={(creatureId, name) => setOpenMob({ creatureId, name })}
        />
      )}
      {openItemId !== null && <ItemDetailModal itemId={openItemId} onClose={() => setOpenItemId(null)} />}
      {openMob && (
        <MobDropTableModal creatureId={openMob.creatureId} mobName={openMob.name} onClose={() => setOpenMob(null)} />
      )}
    </div>
  )
}
