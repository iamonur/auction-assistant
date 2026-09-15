import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Bundled data JSON files (resources/<subdir>/*.json) live outside the
 * Vite-bundled out/ tree, so they need their own resolution: packaged
 * builds get them via electron-builder's extraResources (next to the
 * asar, at process.resourcesPath); dev/unpacked runs read straight from
 * the project's resources/ folder relative to the built main bundle
 * (out/main/index.js -> ../../resources). Each subdir is its own
 * one-time import — see importWorldData.ts (resources/mop-import) and
 * importClassicRecipes.ts (resources/classic-recipes).
 */
export function bundledDataPath(subdir: string, fileName: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, subdir, fileName)
    : path.join(__dirname, '../../resources', subdir, fileName)
}
