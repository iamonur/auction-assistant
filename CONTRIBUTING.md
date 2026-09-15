# Contributing

Issues and PRs are welcome.

## Development

```bash
npm install
npm run dev
```

Before opening a PR:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Testing

Tests live next to the code they cover (`*.test.ts`), focused on the pure query/aggregation layer (`src/main/queries/`, `src/main/db/aggregate.ts`) plus other pure logic (CSV parsing, gold formatting) — the parts most worth guarding against regressions, and the parts a live Electron launch won't reliably catch (this project's real bugs so far were a foreign-key insert-order mistake and a broken import, both caught the hard way — see `src/main/db/aggregate.test.ts` for the regression test that now guards the first one).

`npm test` runs Vitest through Electron's own Node runtime (`ELECTRON_RUN_AS_NODE=1`), not plain system Node — `better-sqlite3`'s native binding is compiled against whichever Node ABI last touched it (`npm install`/`electron-builder install-app-deps` build it for Electron's ABI), and running tests under a mismatched ABI fails immediately. Use `createTestDb()`/`testSettings()` from `src/test/db.ts` for an in-memory database with the real schema instead of hand-rolling fixtures.

## Guidelines

- Keep pricing/liquidity logic consistent: any price or profit figure derived from an item/pet with zero recent trade volume should be treated as low-confidence (greyed out in the UI, excluded from expected-value math) — this rule is applied consistently across Crafting Sniper, Gathering, Battle Pet Farming, Mob Value, and Zone Value; new features touching prices should follow the same rule.
- Game-version-specific data (mob catalog, loot, recipes) lives under `resources/` and is imported into each game version's own SQLite database on first run — see `src/main/db/importWorldData.ts` and `src/main/db/importClassicRecipes.ts`.
- If you regenerate or extend bundled reference data derived from GPL-3.0 sources, keep (or add) the extraction script under `scripts/data-extraction/` so the transformation stays reproducible — see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
- New IPC calls follow the existing pattern: a channel constant in `src/shared/ipcChannels.ts`, a handler in `src/main/ipc.ts`, and a typed binding in `src/preload/index.ts`.

## Reporting bugs

Please include your OS, game version selected (Retail/Classic Era/Classic Progression), and pricing source (Battle.net/TSM) — most issues are specific to one combination.
