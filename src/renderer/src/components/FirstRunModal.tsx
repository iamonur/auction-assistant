import Modal from './Modal'
import PricingSetupForm from './PricingSetupForm'

interface FirstRunModalProps {
  onDismiss: () => void
}

/**
 * Shown once per game version the first time it's active with no
 * completed sync and onboarding not yet dismissed (see App.tsx). Every
 * tab in the app reads from a locally synced price table, so a brand
 * new install otherwise just looks broken/empty with no explanation.
 */
export default function FirstRunModal({ onDismiss }: FirstRunModalProps): React.JSX.Element {
  return (
    <Modal title="Welcome" subtitle="Let's get this game version set up" onClose={onDismiss}>
      <div className="space-y-5 p-5">
        <p className="text-sm text-zinc-400">
          Every screen in this app — Crafting Sniper, Gathering, Mob Value, all of it — reads from prices synced to
          your own machine. Pick a pricing source below and sync once to get started.
        </p>

        <PricingSetupForm onSynced={onDismiss} />

        <p className="text-xs text-zinc-500">
          Playing WoW right now? There&apos;s also an optional in-game addon that puts these prices on item, mob, and
          zone tooltips, and can scan the Auction House for you — set it up anytime in{' '}
          <span className="text-zinc-400">Settings → WoW Addon Sync</span>.
        </p>

        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-zinc-500 underline decoration-dotted hover:text-zinc-300"
        >
          Skip for now — I&apos;ll set this up later in Settings
        </button>
      </div>
    </Modal>
  )
}
