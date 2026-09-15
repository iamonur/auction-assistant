-- Appends the desktop app's last-synced price to item tooltips.
-- Uses OnTooltipSetItem (not the newer retail-only TooltipDataProcessor)
-- since it works unchanged across Retail, Classic Era, and MoP Classic —
-- one shared file, no per-flavor branching needed for this feature.

local function GetTooltipItemId(tooltip)
  local _, link = tooltip:GetItem()
  if not link then
    return nil
  end
  local idText = link:match("item:(%d+)")
  if not idText then
    return nil
  end
  return tonumber(idText)
end

GameTooltip:HookScript("OnTooltipSetItem", function(tooltip)
  local itemId = GetTooltipItemId(tooltip)
  if not itemId then
    return
  end

  local entry = AuctionAssistant.GetItemPrice(itemId)
  if not entry then
    return
  end

  local priceText = AuctionAssistant.FormatCopper(entry.p)
  local volumeText = entry.v and (" (" .. entry.v .. " on AH)") or ""

  if AuctionAssistant.IsStale() then
    tooltip:AddLine("Auction Assistant: " .. priceText .. volumeText .. " |cffff4444[stale]|r", 1, 0.82, 0)
  else
    tooltip:AddLine("Auction Assistant: " .. priceText .. volumeText, 1, 0.82, 0)
  end

  tooltip:Show()
end)
