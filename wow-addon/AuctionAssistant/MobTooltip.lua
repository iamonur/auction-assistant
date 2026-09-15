-- Appends the desktop app's last-synced Expected Value (see
-- main/queries/mobValue.ts — average loot + gold value per kill) to unit
-- tooltips, for any NPC the app has data for. Dead, skinnable corpses
-- also get a separate skinning-value line (main/queries/mobValue.ts#
-- getSkinningExpectedValueMap) — kept as its own line rather than folded
-- into Expected Value, since skinning is an optional action distinct
-- from the kill itself.
--
-- Matched by creature template id, not name: WoW's UnitGUID for an NPC
-- encodes that id directly ("Creature-0-<server>-<instance>-<zoneUID>-
-- <npcId>-<spawnUID>"), and that's the same id the world database — and
-- so this app's mob catalog — uses. Matching by name would be unreliable:
-- many distinct creature templates legitimately share a display name
-- (reskins, "Kobold Vermin" appearing at several levels, etc.).

local function GetTooltipNpcId(tooltip)
  local _, unit = tooltip:GetUnit()
  if not unit then
    return nil
  end

  local guid = UnitGUID(unit)
  if not guid then
    return nil
  end

  local unitType, _, _, _, _, npcIdText = strsplit("-", guid)
  if unitType ~= "Creature" and unitType ~= "Vehicle" then
    return nil -- players, pets, etc. have no creature template id to look up
  end

  return tonumber(npcIdText)
end

GameTooltip:HookScript("OnTooltipSetUnit", function(tooltip)
  local npcId = GetTooltipNpcId(tooltip)
  if not npcId then
    return
  end

  local _, unit = tooltip:GetUnit()
  local staleSuffix = AuctionAssistant.IsStale() and " |cffff4444[stale]|r" or ""
  local addedLine = false

  local expectedValue = AuctionAssistant.GetMobValue(npcId)
  if expectedValue then
    tooltip:AddLine("Auction Assistant: ~" .. AuctionAssistant.FormatCopper(expectedValue) .. staleSuffix, 1, 0.82, 0)
    addedLine = true
  end

  -- Skinning value only makes sense once the creature is actually dead —
  -- a live mob isn't skinnable yet, so showing it there would be
  -- misleading busywork math rather than something the player can act on.
  if unit and UnitIsDead(unit) then
    local skinningValue = AuctionAssistant.GetSkinningValue(npcId)
    if skinningValue then
      tooltip:AddLine("Auction Assistant (skinning): ~" .. AuctionAssistant.FormatCopper(skinningValue) .. staleSuffix, 1, 0.82, 0)
      addedLine = true
    end
  end

  if addedLine then
    tooltip:Show()
  end
end)
