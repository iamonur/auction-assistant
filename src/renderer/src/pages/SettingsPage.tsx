import { useAsyncData } from '../hooks/useAsyncData'
import { LoadingState } from '../components/StateViews'
import PricingSetupForm from '../components/PricingSetupForm'
import AddonSyncSection from '../components/AddonSyncSection'
import { GAME_VERSION_LABELS } from '@shared/gameVersions'

export default function SettingsPage(): React.JSX.Element {
  const { data: gameVersion } = useAsyncData(() => window.api.gameVersion.get(), [])

  if (!gameVersion) {
    return (
      <div className="flex h-full flex-col">
        <header className="border-b border-surface-border bg-surface px-6 py-4">
          <h1 className="font-display text-lg font-semibold text-zinc-100">Settings</h1>
        </header>
        <LoadingState />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-surface-border bg-surface px-6 py-4">
        <h1 className="font-display text-lg font-semibold text-zinc-100">Settings</h1>
        <p className="text-xs text-zinc-500">
          Editing <span className="text-gold">{GAME_VERSION_LABELS[gameVersion]}</span> — its own database and
          credentials, separate from other game versions. Switch versions from the sidebar.
        </p>
      </header>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-xl space-y-6">
          <PricingSetupForm />
          <AddonSyncSection />
        </div>
      </div>
    </div>
  )
}
