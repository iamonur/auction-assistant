-- In-game Auction House scanning for the "modern" AH — Retail AND MoP
-- Classic both run this, via C_AuctionHouse. See AHScan_Legacy.lua for
-- Classic Era, the only one of the three still on the old
-- QueryAuctionItems-based API.
--
-- This split is NOT "Classic vs Retail" — Blizzard retrofitted the
-- modern Auction House UI onto Classic progression realms starting with
-- Cataclysm Classic, so MoP Classic already inherited it. Confirmed
-- against Auctionator's real, current .toc, which groups its own
-- Source_ModernAH under `[AllowLoadGameType cata, mists, mainline]` and
-- Source_LegacyAH under `[AllowLoadGameType vanilla, tbc, wrath]` — the
-- exact same grouping this file and AHScan_Legacy.lua now follow.
--
-- Player-initiated only, same as the legacy scanner: requires the Auction
-- House window to already be open AND the player to either click the
-- "Scan AH" button this file adds next to the AH window, or run /aascan,
-- never triggered just by opening the window.
--
-- Uses C_AuctionHouse.ReplicateItems() — the modern-AH equivalent of the
-- legacy scanner's GetAll query, and confirmed via Auctionator's own real
-- full-scan module (Source_ModernAH/FullScan) as the actual mechanism a
-- comprehensive price-database scan is supposed to use on this API.
--
-- An earlier version of this file used C_AuctionHouse.SendBrowseQuery
-- instead, looping over item categories — that's the mechanism behind
-- Auctionator's interactive keyword *search*, a different tool built for
-- a different job (finding specific items while the AH window is being
-- actively used), not a comprehensive scan. Confirmed as the wrong choice
-- after live-client testing came back with a scan that reported "0 item
-- prices scanned" every time.
--
-- A completed scan only exists in memory until WoW saves SavedVariables —
-- a full logout, or a UI reload — so once the scan finishes, this calls
-- ReloadUI() itself after a short delay (long enough to read the
-- completion message) so the desktop app can pick the results up right
-- away, without the player having to remember to /reload manually.
--
-- Confirmed working live end to end: scan -> reload -> desktop import.

local scanning = false
-- Client-side cooldown tracking, mirroring Auctionator's own real
-- full-scan module: there's no live "can I scan yet" check function for
-- ReplicateItems the way CanSendAuctionQuery() exists for the legacy
-- GetAll query, so this self-imposes the same ~15 minute window
-- Auctionator uses, reset each login (a fresh session always allows one
-- scan attempt).
local lastScanTime = nil

local function SetButtonScanningState(isScanning)
  local button = AuctionAssistant.scanButton
  if not button then return end
  button:SetEnabled(not isScanning)
  button:SetText(isScanning and "Scanning..." or "Scan AH")
end

--- Reads every row currently loaded via ReplicateItems and aggregates
-- them into {itemId -> {p=minBuyout, v=totalCount}} — short field names
-- to match the same {n, p, v} convention the desktop app's own exports
-- use everywhere else (see main/addon/export.ts and
-- main/addon/ahScanImport.ts, which reads these same p/v keys back).
-- Exposed on the addon table so a Lua test harness can call it directly
-- against stubbed C_AuctionHouse.GetNumReplicateItems/
-- GetReplicateItemInfo without going through the real event/query flow.
function AuctionAssistant.AggregateModernAHReplicateItems()
  local items = {}
  local numItems = C_AuctionHouse.GetNumReplicateItems()

  -- 0-based, unlike the legacy list API — confirmed against Auctionator's
  -- own ProcessBatch, which starts its index at 0.
  for i = 0, numItems - 1 do
    local _, _, count, _, _, _, _, _, _, buyoutPrice, _, _, _, _, _, _, itemId, hasAllInfo = C_AuctionHouse.GetReplicateItemInfo(i)

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

  return items, numItems
end

local function FinishScan(message)
  scanning = false
  AuctionAssistant.scanFrame:UnregisterEvent("REPLICATE_ITEM_LIST_UPDATE")
  SetButtonScanningState(false)
  if message then
    print("|cffFFD100Auction Assistant:|r " .. message)
  end
end

local function OnReplicateItemListUpdate()
  local items, numItems = AuctionAssistant.AggregateModernAHReplicateItems()

  if numItems == 0 then
    FinishScan("scan came back with no auctions — try again in a moment.")
    return
  end

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

  lastScanTime = time()
  scanning = false
  AuctionAssistant.scanFrame:UnregisterEvent("REPLICATE_ITEM_LIST_UPDATE")
  SetButtonScanningState(false)

  print(
    "|cffFFD100Auction Assistant:|r "
      .. itemCount
      .. " item prices scanned (from "
      .. numItems
      .. " auctions). Reloading UI to save the results — the Auction House window will close."
  )
  C_Timer.After(1.5, ReloadUI)
end

--- Starts a full AH scan. Requires the Auction House window to be open —
-- ReplicateItems is only meaningful while at an auctioneer, and requiring
-- the frame to be shown keeps this an explicit, in-context player action
-- rather than something that could fire from anywhere.
function AuctionAssistant.StartModernAHScan()
  if scanning then
    print("|cffFFD100Auction Assistant:|r a scan is already in progress.")
    return
  end
  if not AuctionHouseFrame or not AuctionHouseFrame:IsShown() then
    print("|cffFFD100Auction Assistant:|r open the Auction House first.")
    return
  end
  if lastScanTime and (time() - lastScanTime) < (15 * 60) then
    local waitSeconds = (15 * 60) - (time() - lastScanTime)
    print(
      "|cffFFD100Auction Assistant:|r can't run a full scan right now — try again in about "
        .. math.ceil(waitSeconds / 60)
        .. " minute(s)."
    )
    return
  end

  scanning = true
  SetButtonScanningState(true)
  print("|cffFFD100Auction Assistant:|r scanning the Auction House — this can take a few seconds...")
  AuctionAssistant.scanFrame:RegisterEvent("REPLICATE_ITEM_LIST_UPDATE")
  C_AuctionHouse.ReplicateItems()
end

--- Adds a "Scan AH" button just outside the Auction House window, rather
-- than inside it, so it can't overlap Blizzard's own frame content
-- (deliberately conservative: this addon has never been checked against
-- a real client, so avoiding any assumption about free space inside the
-- frame is safer than guessing at a spot that might already be occupied).
local function CreateScanButton()
  if AuctionAssistant.scanButton then return end

  local button = CreateFrame("Button", "AuctionAssistantScanButton", AuctionHouseFrame, "UIPanelButtonTemplate")
  button:SetSize(110, 22)
  button:SetPoint("TOPLEFT", AuctionHouseFrame, "TOPRIGHT", 4, 0)
  button:SetText("Scan AH")
  button:SetScript("OnClick", AuctionAssistant.StartModernAHScan)

  AuctionAssistant.scanButton = button
end

AuctionAssistant.scanFrame = AuctionAssistant.scanFrame or CreateFrame("Frame")
AuctionAssistant.scanFrame:RegisterEvent("AUCTION_HOUSE_SHOW")
AuctionAssistant.scanFrame:SetScript("OnEvent", function(_, event)
  if event == "REPLICATE_ITEM_LIST_UPDATE" and scanning then
    OnReplicateItemListUpdate()
  elseif event == "AUCTION_HOUSE_SHOW" then
    CreateScanButton()
  end
end)

SLASH_AUCTIONASSISTANTSCAN1 = "/aascan"
SlashCmdList["AUCTIONASSISTANTSCAN"] = AuctionAssistant.StartModernAHScan
