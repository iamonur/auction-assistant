import { CreditCard, Coffee, Github, Gift, Heart, type LucideIcon } from 'lucide-react'

interface DonationPlatform {
  id: string
  label: string
  description: string
  icon: LucideIcon
  /** null until a real link is configured — the button renders disabled with "Coming soon" until then. */
  url: string | null
}

const DONATION_PLATFORMS: DonationPlatform[] = [
  {
    id: 'github-sponsors',
    label: 'GitHub Sponsors',
    description: 'Recurring or one-time support through GitHub.',
    icon: Github,
    url: null
  },
  {
    id: 'ko-fi',
    label: 'Ko-fi',
    description: 'Buy the project a coffee, one-time or monthly.',
    icon: Coffee,
    url: null
  },
  {
    id: 'patreon',
    label: 'Patreon',
    description: 'Become a recurring supporter.',
    icon: Heart,
    url: null
  },
  {
    id: 'buy-me-a-coffee',
    label: 'Buy Me a Coffee',
    description: 'A simple one-time tip.',
    icon: Gift,
    url: null
  },
  {
    id: 'direct-payment',
    label: 'Direct Payment',
    description: 'Card payment via Stripe — one-time or recurring.',
    icon: CreditCard,
    url: null
  }
]

export default function SupportPage(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-surface-border bg-surface px-6 py-4">
        <h1 className="font-display text-lg font-semibold text-zinc-100">Support Development</h1>
        <p className="text-xs text-zinc-500">This app is free and open-source (GPL-3.0).</p>
      </header>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-2xl space-y-6">
          <p className="text-sm text-zinc-400">
            If this tool saves you time in-game, consider supporting its development. Nothing here is required and
            no feature is gated behind it — donations just help cover the time spent maintaining it.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {DONATION_PLATFORMS.map((platform) => (
              <DonationCard key={platform.id} platform={platform} />
            ))}
          </div>

          <p className="text-xs text-zinc-600">
            Links aren&apos;t set up yet — this screen is a placeholder until real donation accounts are configured.
          </p>
        </div>
      </div>
    </div>
  )
}

function DonationCard({ platform }: { platform: DonationPlatform }): React.JSX.Element {
  const Icon = platform.icon
  const disabled = platform.url === null

  const content = (
    <>
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gold/10 text-gold">
        <Icon size={17} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-zinc-200">{platform.label}</p>
        <p className="text-xs text-zinc-500">{platform.description}</p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
          disabled ? 'bg-zinc-800/50 text-zinc-600' : 'bg-gold/15 text-gold'
        }`}
      >
        {disabled ? 'Coming soon' : 'Open'}
      </span>
    </>
  )

  const className = 'panel flex items-center gap-3 p-4 text-left transition-colors'

  if (disabled) {
    return (
      <div className={`${className} cursor-not-allowed opacity-60`} aria-disabled="true">
        {content}
      </div>
    )
  }

  return (
    <a href={platform.url ?? undefined} target="_blank" rel="noreferrer" className={`${className} hover:border-gold/40`}>
      {content}
    </a>
  )
}
