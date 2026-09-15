import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { AppSettings, Region } from '@shared/types'
import FormField from './FormField'

interface BattleNetSettingsFieldsProps {
  form: AppSettings
  updateField: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

export default function BattleNetSettingsFields({ form, updateField }: BattleNetSettingsFieldsProps): React.JSX.Element {
  const [showSecret, setShowSecret] = useState(false)

  return (
    <>
      <FormField label="Client ID">
        <input
          type="text"
          value={form.clientId}
          onChange={(event) => updateField('clientId', event.target.value)}
          placeholder="e.g. 1a2b3c4d5e6f7a8b9c0d"
          className="input"
        />
      </FormField>

      <FormField label="Client Secret">
        <div className="relative">
          <input
            type={showSecret ? 'text' : 'password'}
            value={form.clientSecret}
            onChange={(event) => updateField('clientSecret', event.target.value)}
            placeholder="••••••••••••••••"
            className="input pr-10"
          />
          <button
            type="button"
            onClick={() => setShowSecret((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            aria-label={showSecret ? 'Hide secret' : 'Show secret'}
          >
            {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </FormField>

      <FormField label="Realm Slug" hint="URL-friendly slug, e.g. 'grobbulus' or 'faerlina'.">
        <input
          type="text"
          value={form.realmSlug}
          onChange={(event) => updateField('realmSlug', event.target.value.toLowerCase())}
          placeholder="grobbulus"
          className="input"
        />
      </FormField>
    </>
  )
}

export function RegionField({ form, updateField }: BattleNetSettingsFieldsProps): React.JSX.Element {
  return (
    <FormField label="Region">
      <select
        value={form.region}
        onChange={(event) => updateField('region', event.target.value as Region)}
        className="input"
      >
        <option value="us">US</option>
        <option value="eu">EU</option>
      </select>
    </FormField>
  )
}
