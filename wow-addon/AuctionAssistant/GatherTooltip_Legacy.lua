-- Appends the desktop app's last-synced gathering-node value (see
-- main/queries/gathering.ts#listGatheringNodeValueRows) to the tooltip
-- shown when hovering a herb or mining node in the world — Classic Era
-- and MoP Classic version. See GatherTooltip_Retail.lua for Retail.
--
-- Deliberately does NOT use TooltipDataProcessor even though it may
-- technically exist on these clients: confirmed via real, current addon
-- code (kemayo/wow-objectscanner) that Cata Classic (and by extension the
-- same client family MoP Classic runs on) has the TooltipDataProcessor
-- API present but doesn't actually route GameObject tooltips through it
-- — so checking "does the function exist" isn't enough to know it'll
-- fire. This uses the older, universally-reliable path instead: hook
-- GameTooltip's OnShow, rule out every other tooltip type (unit, item,
-- spell), and read the tooltip's own title FontString directly.
--
-- Confirmed working live on both herb and mining nodes.

GameTooltip:HookScript("OnShow", function(tooltip)
  if tooltip:GetUnit() or tooltip:GetItem() or tooltip:GetSpell() then
    return -- handled by MobTooltip.lua / Tooltip.lua, or not a gathering node
  end

  local titleFontString = _G[tooltip:GetName() .. "TextLeft1"]
  if not titleFontString then
    return
  end
  local nodeName = titleFontString:GetText()
  if not nodeName then
    return
  end

  local entry = AuctionAssistant.GetGatheringNodeValue(nodeName)
  if not entry then
    return
  end

  local staleSuffix = AuctionAssistant.IsStale() and " |cffff4444[stale]|r" or ""
  tooltip:AddLine("Auction Assistant: ~" .. AuctionAssistant.FormatCopper(entry.v) .. staleSuffix, 1, 0.82, 0)
  tooltip:Show()
end)
