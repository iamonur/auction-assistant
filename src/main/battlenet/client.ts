import type { GameVersion, Region } from '@shared/types'
import { BATTLE_NET_NAMESPACE_INFIX } from '@shared/gameVersions'

type NamespaceKind = 'static' | 'dynamic' | 'profile'

/** e.g. ('dynamic', 'classic_era', 'us') -> 'dynamic-classic1x-us'; ('dynamic', 'retail', 'us') -> 'dynamic-us'. */
function namespaceFor(kind: NamespaceKind, gameVersion: GameVersion, region: Region): string {
  const infix = BATTLE_NET_NAMESPACE_INFIX[gameVersion]
  return infix ? `${kind}-${infix}-${region}` : `${kind}-${region}`
}

function apiHost(region: Region): string {
  return `https://${region}.api.blizzard.com`
}

function withAuth(url: string, token: string): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}access_token=${encodeURIComponent(token)}`
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Battle.net API request failed (${response.status}) for ${url}: ${body || response.statusText}`)
  }
  return (await response.json()) as T
}

interface RealmResponse {
  connected_realm: { href: string }
  name: string
  slug: string
}

/** Resolves a realm slug to its connected-realm id by parsing the href of the linked resource. */
export async function resolveConnectedRealmId(
  region: Region,
  token: string,
  realmSlug: string,
  gameVersion: GameVersion
): Promise<{ connectedRealmId: number; realmName: string }> {
  const url = withAuth(
    `${apiHost(region)}/data/wow/realm/${encodeURIComponent(realmSlug)}?namespace=${namespaceFor('dynamic', gameVersion, region)}&locale=en_US`,
    token
  )
  const realm = await getJson<RealmResponse>(url)
  const match = realm.connected_realm.href.match(/connected-realm\/(\d+)/)
  if (!match) throw new Error(`Could not parse connected realm id from href: ${realm.connected_realm.href}`)
  return { connectedRealmId: Number(match[1]), realmName: realm.name }
}

export interface RawAuction {
  id: number
  item: { id: number }
  quantity?: number
  unit_price?: number
  buyout?: number
  bid?: number
  time_left: string
}

interface AuctionsResponse {
  auctions: RawAuction[]
}

export async function fetchConnectedRealmAuctions(
  region: Region,
  token: string,
  connectedRealmId: number,
  gameVersion: GameVersion
): Promise<RawAuction[]> {
  const url = withAuth(
    `${apiHost(region)}/data/wow/connected-realm/${connectedRealmId}/auctions?namespace=${namespaceFor('dynamic', gameVersion, region)}&locale=en_US`,
    token
  )
  const data = await getJson<AuctionsResponse>(url)
  return data.auctions
}

export interface ResolvedItem {
  id: number
  name: string
  quality: number
  itemLevel: number | null
  vendorPrice: number | null
  icon: string | null
}

interface ItemResponse {
  id: number
  name: string
  quality: { type: string }
  level: number
  purchase_price: number
}

interface ItemMediaResponse {
  assets: { key: string; value: string }[]
}

const QUALITY_RANK: Record<string, number> = {
  POOR: 0,
  COMMON: 1,
  UNCOMMON: 2,
  RARE: 3,
  EPIC: 4,
  LEGENDARY: 5
}

/** Fetches item name/quality/level/vendor price + icon for an item not yet in the local DB. */
export async function fetchItemDetails(
  region: Region,
  token: string,
  itemId: number,
  gameVersion: GameVersion
): Promise<ResolvedItem> {
  const namespace = namespaceFor('static', gameVersion, region)
  const [item, media] = await Promise.all([
    getJson<ItemResponse>(
      withAuth(`${apiHost(region)}/data/wow/item/${itemId}?namespace=${namespace}&locale=en_US`, token)
    ),
    getJson<ItemMediaResponse>(
      withAuth(`${apiHost(region)}/data/wow/media/item/${itemId}?namespace=${namespace}&locale=en_US`, token)
    ).catch(() => null)
  ])

  const icon = media?.assets.find((asset) => asset.key === 'icon')?.value ?? null

  return {
    id: item.id,
    name: item.name,
    quality: QUALITY_RANK[item.quality.type] ?? 1,
    itemLevel: item.level ?? null,
    vendorPrice: item.purchase_price ?? null,
    icon
  }
}
