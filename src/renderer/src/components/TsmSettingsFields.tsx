import type { AppSettings } from '@shared/types'
import FormField from './FormField'

interface TsmSettingsFieldsProps {
  form: AppSettings
  updateField: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

export default function TsmSettingsFields({ form, updateField }: TsmSettingsFieldsProps): React.JSX.Element {
  return (
    <>
      <FormField label="Pricing Scope">
        <div className="flex gap-2">
          <ScopeButton
            label="Specific realm"
            active={form.tsmScope === 'realm'}
            onClick={() => updateField('tsmScope', 'realm')}
          />
          <ScopeButton
            label="Region-wide (all realms)"
            active={form.tsmScope === 'region'}
            onClick={() => {
              updateField('tsmScope', 'region')
              updateField('realmName', `${form.region.toUpperCase()} (TSM Region-Wide)`)
            }}
          />
        </div>
      </FormField>

      {form.tsmScope === 'region' && (
        <p className="text-xs text-zinc-500">
          Pulls crowd-sourced market value across every {form.region.toUpperCase()} realm — higher sample size, no
          realm slug needed.
        </p>
      )}

      {form.tsmScope === 'realm' && (
        <FormField
          label="Realm Slug"
          hint="The realm segment from your realm's page URL at tradeskillmaster.com — e.g. 'firemaw-alliance' for a Classic realm, or 'area-52' for Retail."
        >
          <input
            type="text"
            value={form.tsmRealmSlug}
            onChange={(event) => {
              const slug = event.target.value.toLowerCase()
              updateField('tsmRealmSlug', slug)
              updateField('realmName', slug)
            }}
            placeholder="firemaw-alliance"
            className="input"
          />
        </FormField>
      )}

      <p className="text-xs text-zinc-600">
        Free and unauthenticated — no TSM account or API key needed. Data comes from{' '}
        <span className="text-zinc-400">public-data.tradeskillmaster.com</span>.
      </p>
    </>
  )
}

function ScopeButton({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? 'border-gold/40 bg-gold/15 text-gold'
          : 'border-surface-border text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
      }`}
    >
      {label}
    </button>
  )
}
