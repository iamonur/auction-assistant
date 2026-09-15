-- In-game Auction House scanning for Classic Era only — the sole flavor
-- among the three this addon supports still on the "legacy" pre-BfA AH
-- API (QueryAuctionItems/GetAuctionItemInfo). Retail and MoP Classic both
-- run the modern AH instead (see AHScan_ModernAH.lua) — Blizzard
-- retrofitted it onto Classic progression realms starting with
-- Cataclysm Classic, so this is a legacy-vs-modern split, not a
-- Classic-vs-Retail one. (An earlier version of this addon assigned MoP
-- Classic to this file by mistake; fixed after live-client testing showed
-- `AuctionFrame` — the legacy frame this file depends on — doesn't exist
-- there at all.)
--
-- Player-initiated only: this never runs on its own. It requires the
-- Auction House window to already be open AND the player to either click
-- the "Scan AH" button this file adds next to the AH window, or run
-- /aascan — matching how Auctionator and TSM's own AuctionDB module
-- trigger a full scan (a deliberate action each time, not "opening the
-- AH" alone), which keeps this clearly on the right side of automated/
-- unattended botting.
--
-- Uses a "GetAll" query — one request that returns every auction on the
-- realm in a single batch, rather than paging through 50 at a time. This
-- is the same approach Auctionator's own legacy full-scan module uses in
-- production. The tradeoff: the server only allows a GetAll query roughly
-- once every 15 minutes (per-session) — CanSendAuctionQuery()'s second
-- return value reports whether that window is currently open, and this
-- addon just tells the player to wait rather than falling back to a
-- much slower page-by-page scan.
--
-- A completed scan only exists in memory until WoW saves SavedVariables —
-- a full logout, or a UI reload — so once the scan finishes, this calls
-- ReloadUI() itself after a short delay (long enough to read the
-- completion message) so the desktop app can pick the results up right
-- away, without the player having to remember to /reload manually.

local scanning = false

local function SetButtonScanningState(isScanning)
  local button = AuctionAssistant.scanButton
  if not button then return end
  button:SetEnabled(not isScanning)
  button:SetText(isScanning and "Scanning..." or "Scan AH")
end

local function FinishScan(message)
  scanning = false
  AuctionAssistant.scanFrame:UnregisterEvent("AUCTION_ITEM_LIST_UPDATE")
  SetButtonScanningState(false)
  if message then
    print("|cffFFD100Auction Assistant:|r " .. message)
  end
end

--- Reads every row currently loaded in the "list" query results and
-- aggregates them into {itemId -> {p=minBuyout, v=totalCount}} — short
-- field names to match the same {n, p, v} convention the desktop app's
-- own exports use everywhere else (see main/addon/export.ts and
-- main/addon/ahScanImport.ts, which reads these same p/v keys back).
-- Exposed on the addon table so a Lua test harness can call it directly
-- against stubbed GetNumAuctionItems/GetAuctionItemInfo without going
-- through the real event/query flow.
function AuctionAssistant.AggregateLegacyAuctionList()
  local items = {}
  local numBatch = GetNumAuctionItems("list")

  for i = 1, numBatch do
    local _, _, count, _, _, _, _, _, _, buyoutPrice, _, _, _, _, _, _, itemId, hasAllInfo = GetAuctionItemInfo("list", i)

    if hasAllInfo and itemId and itemId > 0 and buyoutPrice and buyoutPrice > 0 then
      local entry = items[itemId]
      if not entry then
        entry = { p = buyoutPrice, v = 0 }
        items[itemId] = entry
      elseif buyoutPrice < entry.p then
        entry.p = buyoutPrice
      end
      entry.v = entry.v + (count or 1)
    end
  end

  return items, numBatch
end

local function OnAuctionItemListUpdate()
  local num, total = GetNumAuctionItems("list")
  if num == 0 or num ~= total then
    FinishScan("scan didn't complete cleanly (got " .. num .. "/" .. total .. " results) — try again in a moment.")
    return
  end

  local items = AuctionAssistant.AggregateLegacyAuctionList()

  local itemCount = 0
  for _ in pairs(items) do
    itemCount = itemCount + 1
  end

  -- No region/realm written here: the desktop app already knows which
  -- (region, realm) it's actively tracking (see Settings) and applies the
  -- imported scan to that, the same way it already does for the price
  -- export direction — the addon doesn't need to get that right itself.
  AuctionAssistantScan = {
    schemaVersion = 1,
    scannedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
    items = items
  }

  scanning = false
  AuctionAssistant.scanFrame:UnregisterEvent("AUCTION_ITEM_LIST_UPDATE")
  SetButtonScanningState(false)

  print(
    "|cffFFD100Auction Assistant:|r "
      .. itemCount
      .. " item prices scanned. Reloading UI to save the results — the Auction House window will close."
  )
  C_Timer.After(1.5, ReloadUI)
end

--- Starts a full AH scan. Requires the Auction House window to be open —
-- QueryAuctionItems is only meaningful while at an auctioneer, and
-- requiring the frame to be shown keeps this an explicit, in-context
-- player action rather than something that could fire from anywhere.
function AuctionAssistant.StartLegacyScan()
  if scanning then
    print("|cffFFD100Auction Assistant:|r a scan is already in progress.")
    return
  end
  if not AuctionFrame or not AuctionFrame:IsShown() then
    print("|cffFFD100Auction Assistant:|r open the Auction House first.")
    return
  end

  local canScan, canGetAll = CanSendAuctionQuery()
  if not canGetAll then
    print(
      "|cffFFD100Auction Assistant:|r can't run a full scan right now — the server allows one roughly every 15 minutes. Try again shortly."
    )
    return
  end
  if not canScan then
    print("|cffFFD100Auction Assistant:|r Auction House query is on cooldown — try again in a moment.")
    return
  end

  scanning = true
  SetButtonScanningState(true)
  print("|cffFFD100Auction Assistant:|r scanning the Auction House — this can take a few seconds...")
  AuctionAssistant.scanFrame:RegisterEvent("AUCTION_ITEM_LIST_UPDATE")
  QueryAuctionItems("", nil, nil, 0, nil, nil, true, false, nil)
end

--- Adds a "Scan AH" button just outside the Auction House window, rather
-- than inside it, so it can't overlap Blizzard's own frame content
-- (deliberately conservative: this addon has never been checked against
-- a real client, so avoiding any assumption about free space inside the
-- frame is safer than guessing at a spot that might already be occupied).
local function CreateScanButton()
  if AuctionAssistant.scanButton then return end

  local button = CreateFrame("Button", "AuctionAssistantScanButton", AuctionFrame, "UIPanelButtonTemplate")
  button:SetSize(110, 22)
  button:SetPoint("TOPLEFT", AuctionFrame, "TOPRIGHT", 4, 0)
  button:SetText("Scan AH")
  button:SetScript("OnClick", AuctionAssistant.StartLegacyScan)

  AuctionAssistant.scanButton = button
end

AuctionAssistant.scanFrame = AuctionAssistant.scanFrame or CreateFrame("Frame")
AuctionAssistant.scanFrame:RegisterEvent("AUCTION_HOUSE_SHOW")
AuctionAssistant.scanFrame:SetScript("OnEvent", function(_, event)
  if event == "AUCTION_ITEM_LIST_UPDATE" then
    OnAuctionItemListUpdate()
  elseif event == "AUCTION_HOUSE_SHOW" then
    CreateScanButton()
  end
end)

SLASH_AUCTIONASSISTANTSCAN1 = "/aascan"
SlashCmdList["AUCTIONASSISTANTSCAN"] = AuctionAssistant.StartLegacyScan
