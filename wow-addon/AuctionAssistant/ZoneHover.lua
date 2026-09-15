-- Shows the desktop app's Zone Value data as a tooltip that follows the
-- cursor while the world map is open — hover any zone (whether you're
-- looking at a whole continent or already zoomed into one zone) and, if
-- the app has data for it, see its name and average mob value.
--
-- Why polling the cursor, not an event: WoW has no "mouse moved over this
-- map region" event — the same thing the default UI does internally to
-- highlight a zone and show its name when you hover a continent map is
-- driven by polling the cursor position every frame the map is open, and
-- that's what this does too, throttled to ~10 times/second so it doesn't
-- cost anything meaningful.
--
-- Why matching by name, not by map id: WoW's current map system
-- (C_Map / UiMapID, introduced in patch 8.0) uses a completely different
-- id space than the old AreaTable-based map ids in the app's world-database
-- export. Rather than guess a translation between the two from outside the
-- game, this reads the live zone name for whatever position the cursor is
-- over and looks it up by name — see Core.lua's NormalizeDisplayName/
-- GetZoneValue.
--
-- STATUS: position resolution itself is confirmed working as of the
-- current version (both continent-level and zone-level hover correctly
-- resolve a real zone name — see history below). What's NOT yet confirmed
-- is the NAME MATCH against the app's own zone data: live testing shows
-- resolved names never match any of the 83+ real entries the addon has
-- loaded, on every zone tested. That's a data/normalization mismatch
-- between the live-resolved name and the exported name, not a resolution
-- bug — see Core.lua's `/aa zones` command, added specifically to compare
-- the two directly instead of guessing at the mismatch.
--
-- Resolution history, in order, so a future attempt doesn't repeat one:
--   Round 1: called only C_Map.GetMapInfoAtPosition(uiMapID, x, y).
--     Result: showed nothing on sub-zones, only ever the continent's own
--     info — it was returning uiMapID's own map back, not a child.
--   Round 2: added a fallback to MapUtil.FindBestAreaNameAtMouse(uiMapID,
--     x, y), AND passed `true` as GetMapInfoAtPosition's 4th argument
--     (ignoreZoneMapPositionData), matching Blizzard's own click-to-
--     navigate handler (MapCanvasMixin:NavigateToCursor).
--     Result: WORSE — continent-view hover broke for most continents,
--     only Pandaria/Outland kept working. The 4th argument was the prime
--     suspect.
--   Round 3: reverted the 4th argument. Result: continent-level hover
--     confirmed working again. Zone-level hover confirmed resolving to a
--     real zone name — but never matching the app's data (this version's
--     starting point).
--
-- DEBUG MODE: run `/aamapdebug` to toggle. While on, every resolution
-- attempt prints what each step actually returned, throttled to only
-- print when the result changes. Pair with `/aa zones` (Core.lua) to see
-- the actual stored zone names/keys side by side with what's resolving
-- live.

local POLL_INTERVAL = 0.1
local elapsed = 0
local lastDebugLine = nil

local poller = CreateFrame("Frame")
poller:Hide()

local function HideZoneTooltip()
  if GameTooltip:IsOwned(poller) then
    GameTooltip:Hide()
  end
end

local function DebugPrint(line)
  if not AuctionAssistant.mapDebug then
    return
  end
  if line == lastDebugLine then
    return -- only print when something actually changed, so this doesn't spam every 0.1s
  end
  lastDebugLine = line
  print("|cff33ccffAA map debug:|r " .. line)
end

--- Resolves the zone under the cursor and shows/hides the tooltip
-- accordingly. Exposed on the addon table (rather than kept local) so a
-- Lua test harness can call it directly without driving a real OnUpdate
-- loop or real cursor hardware.
function AuctionAssistant.RefreshZoneHoverTooltip()
  if not WorldMapFrame or not WorldMapFrame:IsShown() then
    HideZoneTooltip()
    return
  end

  local uiMapID = WorldMapFrame:GetMapID()
  if not uiMapID then
    HideZoneTooltip()
    return
  end

  local x, y = WorldMapFrame:GetNormalizedCursorPosition()
  if not x or not y or x < 0 or x > 1 or y < 0 or y > 1 then
    HideZoneTooltip()
    return
  end

  local currentMapInfo = C_Map.GetMapInfo(uiMapID)
  local currentMapName = currentMapInfo and currentMapInfo.name or "?"

  local zoneName = nil
  local resolvedVia = nil
  local positionMapInfo = C_Map.GetMapInfoAtPosition(uiMapID, x, y)
  if positionMapInfo and positionMapInfo.mapID ~= uiMapID then
    zoneName = positionMapInfo.name
    resolvedVia = "GetMapInfoAtPosition -> " .. tostring(positionMapInfo.mapID)
  else
    zoneName = MapUtil.FindBestAreaNameAtMouse(uiMapID, x, y)
    resolvedVia = "MapUtil.FindBestAreaNameAtMouse"
  end

  if not zoneName then
    DebugPrint(
      string.format(
        "viewing [%s] (id %d) at (%.2f, %.2f) — %s returned nothing",
        currentMapName,
        uiMapID,
        x,
        y,
        resolvedVia
      )
    )
    HideZoneTooltip()
    return
  end

  local entry = AuctionAssistant.GetZoneValue(zoneName)
  local normalizedKey = AuctionAssistant.NormalizeDisplayName(zoneName)
  DebugPrint(
    string.format(
      'viewing [%s] (id %d) — %s resolved "%s" (key "%s") — data match: %s',
      currentMapName,
      uiMapID,
      resolvedVia,
      zoneName,
      tostring(normalizedKey),
      entry and "yes" or "no"
    )
  )

  if not entry then
    HideZoneTooltip()
    return
  end

  GameTooltip:SetOwner(poller, "ANCHOR_CURSOR")
  GameTooltip:SetText(zoneName, 1, 0.82, 0)
  GameTooltip:AddLine(
    "Auction Assistant — avg. mob value: " .. AuctionAssistant.FormatCopper(entry.v) .. " (" .. (entry.m or 0) .. " mobs tracked)",
    1,
    1,
    1,
    true
  )
  if AuctionAssistant.IsStale() then
    GameTooltip:AddLine("Stale — export again from the desktop app", 1, 0.3, 0.3)
  end
  GameTooltip:Show()
end

poller:SetScript("OnUpdate", function(self, delta)
  elapsed = elapsed + delta
  if elapsed < POLL_INTERVAL then
    return
  end
  elapsed = 0
  AuctionAssistant.RefreshZoneHoverTooltip()
end)

if WorldMapFrame then
  WorldMapFrame:HookScript("OnShow", function()
    poller:Show()
  end)
  WorldMapFrame:HookScript("OnHide", function()
    poller:Hide()
    HideZoneTooltip()
  end)
end

SLASH_AUCTIONASSISTANTMAPDEBUG1 = "/aamapdebug"
SlashCmdList["AUCTIONASSISTANTMAPDEBUG"] = function()
  AuctionAssistant.mapDebug = not AuctionAssistant.mapDebug
  lastDebugLine = nil
  print("|cffFFD100Auction Assistant:|r map debug " .. (AuctionAssistant.mapDebug and "ON" or "OFF"))
end
