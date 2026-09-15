import type { Region } from '@shared/types'

interface CachedToken {
  accessToken: string
  expiresAt: number // epoch ms
  clientId: string
}

let cachedToken: CachedToken | null = null

/**
 * Battle.net OAuth 2.0 Client Credentials flow. Tokens are cached
 * in-memory (not persisted) and refreshed a minute before expiry;
 * re-fetched whenever the configured client ID changes.
 */
export async function getAccessToken(
  clientId: string,
  clientSecret: string,
  region: Region
): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.clientId === clientId && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.accessToken
  }

  const tokenUrl = `https://${region}.battle.net/oauth/token`
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Battle.net OAuth failed (${response.status}): ${body || response.statusText}`)
  }

  const data = (await response.json()) as { access_token: string; expires_in: number }
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
    clientId
  }
  return cachedToken.accessToken
}

export function clearTokenCache(): void {
  cachedToken = null
}
