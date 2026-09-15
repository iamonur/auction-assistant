-- Auction Assistant (WoW addon)
--
-- Companion to the "Crafting & Auction Assistant" desktop app. This addon
-- does not talk to the app directly — WoW's Lua sandbox has no sockets or
-- file I/O beyond SavedVariables, so there is no live connection. Instead:
--
--   1. The desktop app exports a price snapshot into this addon's
--      SavedVariables file (AuctionAssistantPrices) while WoW is closed.
--   2. WoW loads that file into the AuctionAssistantPrices global on login.
--   3. This addon reads it and shows prices on item tooltips, zone values
--      on the world map, mob and skinning values on unit tooltips, and
--      gathering node values on herb/ore tooltips.
--
-- Everything shown in-game reflects "prices as of your last app export,"
-- not a live feed — there is no way for a legitimate addon to do better
-- than that. See Tooltip.lua, ZoneHover.lua, MobTooltip.lua, and
-- GatherTooltip_*.lua for where the data actually gets used.

AuctionAssistant = AuctionAssistant or {}

local EXPECTED_SCHEMA_VERSION = 1
local STALE_AFTER_SECONDS = 14 * 24 * 60 * 60 -- 14 days

--- Formats copper as "Xg Ys Zc", matching the desktop app's own formatCopperAsGold.
function AuctionAssistant.FormatCopper(copper)
  if copper == nil then
    return "—"
  end
  local negative = copper < 0
  local absolute = math.floor(math.abs(copper) + 0.5)

  local gold = math.floor(absolute / 10000)
  local silver = math.floor((absolute % 10000) / 100)
  local bronze = absolute % 100

  local parts = {}
  if gold > 0 then
    table.insert(parts, gold .. "g")
  end
  if silver > 0 or gold > 0 then
    table.insert(parts, silver .. "s")
  end
  table.insert(parts, bronze .. "c")

  local text = table.concat(parts, " ")
  if negative then
    text = "-" .. text
  end
  return text
end

--- Parses the "YYYY-MM-DDTHH:MM:SSZ" exportedAt stamp into a Lua time value.
-- Treated as local time for comparison purposes — a few hours of timezone
-- skew doesn't matter for a multi-day staleness check.
local function ParseExportedAt(exportedAt)
  if type(exportedAt) ~= "string" then
    return nil
  end
  local year, month, day, hour, min, sec = exportedAt:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
  if not year then
    return nil
  end
  return time({
    year = tonumber(year),
    month = tonumber(month),
    day = tonumber(day),
    hour = tonumber(hour),
    min = tonumber(min),
    sec = tonumber(sec)
  })
end

--- True if the last export is older than STALE_AFTER_SECONDS, or its age can't be determined.
function AuctionAssistant.IsStale()
  local db = AuctionAssistantPrices
  if not db or not db.exportedAt then
    return true
  end
  local exportedTime = ParseExportedAt(db.exportedAt)
  if not exportedTime then
    return true
  end
  return (time() - exportedTime) > STALE_AFTER_SECONDS
end

--- Looks up one item's price snapshot by numeric item id. Returns nil if
-- there's no data yet, the schema doesn't match what this addon expects,
-- or the item isn't in the snapshot.
function AuctionAssistant.GetItemPrice(itemId)
  local db = AuctionAssistantPrices
  if not db or db.schemaVersion ~= EXPECTED_SCHEMA_VERSION or not db.items then
    return nil
  end
  return db.items[itemId]
end

--- Reduces a display name to a stable lookup key: lowercase, letters/
-- digits only. Must exactly match main/addon/displayName.ts's
-- normalizeDisplayName on the desktop app side — every name-keyed export
-- (zones, gathering nodes) is keyed by that function's output, and this
-- is how the addon looks a live in-game name back up against it. If you
-- change one, change the other.
function AuctionAssistant.NormalizeDisplayName(name)
  if type(name) ~= "string" then
    return nil
  end
  return name:lower():gsub("[^a-z0-9]", "")
end

--- Looks up one zone's value snapshot by its display name (as read live
-- from C_Map). Returns nil under the same conditions as GetItemPrice,
-- or when the name doesn't normalize to anything in the snapshot.
function AuctionAssistant.GetZoneValue(zoneName)
  local db = AuctionAssistantPrices
  if not db or db.schemaVersion ~= EXPECTED_SCHEMA_VERSION or not db.zones then
    return nil
  end
  local key = AuctionAssistant.NormalizeDisplayName(zoneName)
  if not key then
    return nil
  end
  return db.zones[key]
end

--- Looks up one mob's Expected Value (see main/queries/mobValue.ts) by its
-- creature template id — the same "npcId" WoW's own UnitGUID exposes for
-- any NPC unit. Returns nil under the same conditions as GetItemPrice, or
-- when the creature has no positive expected value (worthless mobs are
-- dropped at export time, not stored as zero).
function AuctionAssistant.GetMobValue(creatureId)
  local db = AuctionAssistantPrices
  if not db or db.schemaVersion ~= EXPECTED_SCHEMA_VERSION or not db.mobs or not creatureId then
    return nil
  end
  return db.mobs[creatureId]
end

--- Looks up one creature's skinning value (see
-- main/queries/mobValue.ts#getSkinningExpectedValueMap) by creature
-- template id. Kept separate from GetMobValue — skinning is only ever
-- relevant for a dead, skinnable corpse, not every mob's tooltip.
function AuctionAssistant.GetSkinningValue(creatureId)
  local db = AuctionAssistantPrices
  if not db or db.schemaVersion ~= EXPECTED_SCHEMA_VERSION or not db.skinning or not creatureId then
    return nil
  end
  return db.skinning[creatureId]
end

--- Looks up one gathering node's value snapshot by its live tooltip name
-- (a herb or ore node — see GatherTooltip_*.lua). Returns nil under the
-- same conditions as GetZoneValue.
function AuctionAssistant.GetGatheringNodeValue(nodeName)
  local db = AuctionAssistantPrices
  if not db or db.schemaVersion ~= EXPECTED_SCHEMA_VERSION or not db.gatheringNodes then
    return nil
  end
  local key = AuctionAssistant.NormalizeDisplayName(nodeName)
  if not key then
    return nil
  end
  return db.gatheringNodes[key]
end

local frame = CreateFrame("Frame")
frame:RegisterEvent("ADDON_LOADED")
frame:SetScript("OnEvent", function(_, _, addonName)
  if addonName ~= "AuctionAssistant" then
    return
  end

  -- First-ever load on this account: seed an empty, correctly-shaped table
  -- so every other function can assume AuctionAssistantPrices.items exists
  -- rather than checking for nil everywhere.
  if type(AuctionAssistantPrices) ~= "table" then
    AuctionAssistantPrices = {
      schemaVersion = EXPECTED_SCHEMA_VERSION,
      exportedAt = nil,
      gameVersion = nil,
      region = nil,
      realm = nil,
      items = {},
      zones = {},
      mobs = {},
      skinning = {},
      gatheringNodes = {}
    }
  end

  -- An account that last exported before zone/mob/skinning/gathering data
  -- existed has an older, partial table on disk — top up any missing
  -- fields so the Get* lookups don't have to special-case "never
  -- exported" vs. "exported, but from an older version."
  for _, field in ipairs({ "zones", "mobs", "skinning", "gatheringNodes" }) do
    if type(AuctionAssistantPrices[field]) ~= "table" then
      AuctionAssistantPrices[field] = {}
    end
  end
end)

SLASH_AUCTIONASSISTANT1 = "/auctionassistant"
SLASH_AUCTIONASSISTANT2 = "/aa"
SlashCmdList["AUCTIONASSISTANT"] = function(msg)
  local db = AuctionAssistantPrices
  if not db or not db.exportedAt then
    print("|cffFFD100Auction Assistant:|r no price data yet — export from the desktop app, then fully relog.")
    return
  end

  -- Lua's standard string library has no trim() — WoW doesn't add one
  -- either, so do it by hand rather than assume it exists.
  msg = (msg or ""):gsub("^%s*(.-)%s*$", "%1"):lower()

  -- `/aa zones` — lists a sample of zone entries actually stored, exactly
  -- as exported (display name + normalized key), so it can be compared
  -- directly against what /aamapdebug resolves live in-game, without
  -- anyone having to transcribe chat text by hand.
  if msg == "zones" then
    local count = 0
    local shown = 0
    local lines = {}
    for key, entry in pairs(db.zones or {}) do
      count = count + 1
      if shown < 15 then
        table.insert(lines, string.format('  "%s" -> key "%s"', entry.n or "?", key))
        shown = shown + 1
      end
    end
    print("|cffFFD100Auction Assistant:|r " .. count .. " zone(s) stored. Showing " .. shown .. ":")
    for _, line in ipairs(lines) do
      print(line)
    end
    return
  end

  local function CountEntries(t)
    local count = 0
    for _ in pairs(t or {}) do
      count = count + 1
    end
    return count
  end

  local staleNote = AuctionAssistant.IsStale() and " |cffff4444(stale)|r" or ""
  print(
    string.format(
      "|cffFFD100Auction Assistant:|r %d item price%s, %d zone value%s, %d mob value%s, %d skinning value%s, %d gathering node%s loaded, exported %s (%s/%s)%s",
      CountEntries(db.items),
      CountEntries(db.items) == 1 and "" or "s",
      CountEntries(db.zones),
      CountEntries(db.zones) == 1 and "" or "s",
      CountEntries(db.mobs),
      CountEntries(db.mobs) == 1 and "" or "s",
      CountEntries(db.skinning),
      CountEntries(db.skinning) == 1 and "" or "s",
      CountEntries(db.gatheringNodes),
      CountEntries(db.gatheringNodes) == 1 and "" or "s",
      db.exportedAt or "unknown",
      db.region or "?",
      db.realm or "?",
      staleNote
    )
  )
  print("|cffFFD100Auction Assistant:|r run \"/aa zones\" to list stored zone names.")
end
