import { useState } from 'react'
import { AlertTriangle, Download, FolderOpen, Loader2, Upload } from 'lucide-react'
import FormField from './FormField'
import { useAsyncData } from '../hooks/useAsyncData'

/**
 * WoW has no live connection to this app — the addon companion only ever
 * reads whatever was last exported here, refreshed on the player's next
 * full relog, and the app only ever sees whatever the addon last saved to
 * disk. The AH scan direction reloads the UI itself right after a
 * completed scan (see AHScan_Legacy.lua/AHScan_Retail.lua) specifically
 * so the player never has to remember a manual /reload — no need to
 * fully exit WoW for this direction either way. See
 * wow-addon/AuctionAssistant/Core.lua and main/addon/export.ts for the
 * export direction, and wow-addon/AuctionAssistant/AHScan_*.lua and
 * main/addon/ahScanImport.ts for this import direction.
 */
export default function AddonSyncSection(): React.JSX.Element {
  const { data: settings, reload } = useAsyncData(() => window.api.settings.get(), [])
  const [picking, setPicking] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exportWowRunningWarning, setExportWowRunningWarning] = useState(false)
  const [result, setResult] = useState<{ text: string; success: boolean } | null>(null)
  const [importResult, setImportResult] = useState<{ text: string; success: boolean } | null>(null)

  if (!settings) return <></>

  const handlePickFolder = async (): Promise<void> => {
    setPicking(true)
    try {
      const folder = await window.api.addon.pickWowFolder()
      if (folder) {
        await window.api.settings.set({ wowFlavorPath: folder })
        reload()
      }
    } finally {
      setPicking(false)
    }
  }

  const handleExport = async (): Promise<void> => {
    setExporting(true)
    setResult(null)
    setExportWowRunningWarning(false)
    try {
      const running = await window.api.addon.checkWowRunning()
      if (running) setExportWowRunningWarning(true)

      const outcome = await window.api.addon.exportPrices()
      setResult({ text: outcome.message, success: outcome.success })
    } finally {
      setExporting(false)
    }
  }

  // No "is WoW running" check here, unlike export: nothing in the client
  // touches AuctionAssistantScan again after a scan finishes, so there's
  // no risk of WoW's own next save clobbering an import the way there is
  // for export. The only real requirement — a save (via /reload or
  // logout) has happened since the last scan — isn't something a running/
  // not-running process check can tell us, so it's covered by the static
  // instructions below instead of a runtime warning.
  const handleImportAhScan = async (): Promise<void> => {
    setImporting(true)
    setImportResult(null)
    try {
      const outcome = await window.api.addon.importAhScan()
      setImportResult({ text: outcome.message, success: outcome.success })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="panel space-y-4 p-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">WoW Addon Sync</p>
        <p className="mt-1 text-xs text-zinc-500">
          Pairs with the &quot;Auction Assistant&quot; in-game addon (see <code>wow-addon/</code> in the repo) —
          shows this app&apos;s last-synced prices on item tooltips. Not live: the addon only sees whatever you
          exported here as of your last full relog.
        </p>
      </div>

      <FormField label="WoW installation folder" hint="The folder that directly contains Interface/ and WTF/ for this game version.">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={settings.wowFlavorPath}
            readOnly
            placeholder="Not set"
            className="input flex-1 cursor-default"
          />
          <button
            type="button"
            onClick={() => void handlePickFolder()}
            disabled={picking}
            className="flex shrink-0 items-center gap-2 rounded-md border border-surface-border px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-gold/40 hover:text-gold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {picking ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
            Choose…
          </button>
        </div>
      </FormField>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={exporting || !settings.wowFlavorPath}
          className="flex items-center gap-2 rounded-md border border-gold/30 bg-gold/10 px-4 py-2 text-sm font-medium text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          Export Prices to Addon
        </button>

        {result && (
          <span className={`text-xs ${result.success ? 'text-profit-positive' : 'text-profit-negative'}`}>
            {result.text}
          </span>
        )}
      </div>

      <div className="border-t border-surface-border pt-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">AH Scan Import</p>
        <p className="mt-1 text-xs text-zinc-500">
          In-game, open the Auction House and click its &quot;Scan AH&quot; button (or run <code>/aascan</code>) —
          never automated, that&apos;s a click or command you make yourself. It reloads your UI automatically once
          the scan finishes so the results are saved to disk right away (the AH window will close — that&apos;s
          expected). Then import here — you don&apos;t need to close WoW at all for this direction. A fresh scan
          (under 24h old) is preferred over TSM/Battle.net pricing everywhere in this app; older scan data falls
          back to whichever of those you have configured above.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleImportAhScan()}
            disabled={importing || !settings.wowFlavorPath}
            className="flex items-center gap-2 rounded-md border border-gold/30 bg-gold/10 px-4 py-2 text-sm font-medium text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Import AH Scan from Addon
          </button>

          {importResult && (
            <span className={`text-xs ${importResult.success ? 'text-profit-positive' : 'text-profit-negative'}`}>
              {importResult.text}
            </span>
          )}
        </div>
      </div>

      {exportWowRunningWarning && (
        <p className="flex items-start gap-2 text-xs text-profit-negative">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          WoW looks like it might be running — an export made now can get overwritten by the client&apos;s own save
          the next time you log out. For best results, close WoW fully before exporting.
        </p>
      )}
    </div>
  )
}
