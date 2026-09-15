import { useEffect, useState } from 'react'
import { Loader2, PlugZap } from 'lucide-react'
import { useAsyncData } from '../hooks/useAsyncData'
import { LoadingState } from './StateViews'
import FormField from './FormField'
import BattleNetSettingsFields, { RegionField } from './BattleNetSettingsFields'
import TsmSettingsFields from './TsmSettingsFields'
import type { AppSettings, PricingSource } from '@shared/types'

const PRICING_SOURCES: { value: PricingSource; label: string; blurb: string }[] = [
  {
    value: 'battlenet',
    label: 'Official Battle.net AH API',
    blurb: 'Raw per-connected-realm auction snapshots straight from Blizzard. Needs your own free API client.'
  },
  {
    value: 'tsm',
    label: 'TSM Crowd-Sourced Pricing',
    blurb: "Pre-aggregated market value from TradeSkillMaster's free public data feed. No account or key needed."
  }
]

interface PricingSetupFormProps {
  /** Fires once a sync completes successfully — e.g. so a first-run modal can close itself. */
  onSynced?: () => void
}

/**
 * The pricing-source picker + region/credential fields + "test & sync"
 * action — shared between the Settings page and the first-run onboarding
 * modal so the two never drift out of sync with each other.
 */
export default function PricingSetupForm({ onSynced }: PricingSetupFormProps): React.JSX.Element {
  const { data: initialSettings, loading } = useAsyncData(() => window.api.settings.get(), [])
  const [form, setForm] = useState<AppSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ text: string; success: boolean } | null>(null)

  useEffect(() => {
    setForm(initialSettings ?? null)
  }, [initialSettings])

  const updateField = <K extends keyof AppSettings>(key: K, value: AppSettings[K]): void => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const handleTestAndSync = async (): Promise<void> => {
    if (!form) return
    setSaving(true)
    setTestResult(null)
    try {
      await window.api.settings.set(form)
      const testOutcome = await window.api.ah.testConnection()
      if (!testOutcome.success) {
        setTestResult({ text: testOutcome.message, success: false })
        return
      }
      const syncOutcome = await window.api.ah.fetchData()
      setTestResult({ text: syncOutcome.message, success: syncOutcome.success })
      if (syncOutcome.success) onSynced?.()
    } catch (error) {
      setTestResult({ text: error instanceof Error ? error.message : 'Unknown error.', success: false })
    } finally {
      setSaving(false)
    }
  }

  if (loading || !form) return <LoadingState />

  return (
    <div className="space-y-6">
      <div className="panel space-y-3 p-6">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Pricing Source</p>
        {PRICING_SOURCES.map((source) => (
          <label
            key={source.value}
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
              form.pricingSource === source.value
                ? 'border-gold/40 bg-gold/10'
                : 'border-surface-border hover:border-zinc-600'
            }`}
          >
            <input
              type="radio"
              name="pricingSource"
              checked={form.pricingSource === source.value}
              onChange={() => updateField('pricingSource', source.value)}
              className="mt-1 accent-[#FFD100]"
            />
            <span>
              <span
                className={`block text-sm font-medium ${form.pricingSource === source.value ? 'text-gold' : 'text-zinc-200'}`}
              >
                {source.label}
              </span>
              <span className="block text-xs text-zinc-500">{source.blurb}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="panel space-y-5 p-6">
        <RegionField form={form} updateField={updateField} />

        {form.pricingSource === 'battlenet' ? (
          <BattleNetSettingsFields form={form} updateField={updateField} />
        ) : (
          <TsmSettingsFields form={form} updateField={updateField} />
        )}

        {form.realmName && (
          <FormField label="Active realm key">
            <p className="text-sm text-zinc-300">{form.realmName}</p>
          </FormField>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => void handleTestAndSync()}
            disabled={saving}
            className="flex items-center gap-2 rounded-md border border-gold/30 bg-gold/10 px-4 py-2 text-sm font-medium text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <PlugZap size={15} />}
            Test API Connection & Sync
          </button>

          {testResult && (
            <span className={`text-xs ${testResult.success ? 'text-profit-positive' : 'text-profit-negative'}`}>
              {testResult.text}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
