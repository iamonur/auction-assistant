-- Appends the desktop app's last-synced gathering-node value (see
-- main/queries/gathering.ts#listGatheringNodeValueRows) to the tooltip
-- shown when hovering a herb or mining node in the world.
--
-- Gathering nodes are GameObjects, not units or items, so neither
-- Tooltip.lua's OnTooltipSetItem hook nor MobTooltip.lua's
-- OnTooltipSetUnit hook ever fires for them — this needs its own hook.
-- Retail uses the modern tooltip data system: TooltipDataProcessor.
-- AddTooltipPostCall(Enum.TooltipDataType.Object, ...) fires with the
-- object's tooltip lines already built, and tooltipData.lines[1].leftText
-- is its display name — confirmed against real, current addon code
-- (kemayo/wow-objectscanner). Note this is Enum.TooltipDataType.Object,
-- not .GameObject — an easy name to get wrong, since Blizzard's own enum
-- doesn't match the "GameObject" terminology used everywhere else in the
-- API for this same concept.
--
-- Matched by the node's display name, not a numeric id: the world
-- database this app's gathering data comes from does carry a real
-- GameObject template id (see gathering_node_spawns.gameobject_id in the
-- desktop app's schema), but there's no reliably-available way to read
-- that same numeric id back from a tooltip in-game, even here on Retail —
-- so this uses the same name-based matching as Zone Value, for one
-- consistent approach across both this file and GatherTooltip_Legacy.lua.

local function ShowGatherValue(tooltip, nodeName)
  if not nodeName then
    return
  end

  local entry = AuctionAssistant.GetGatheringNodeValue(nodeName)
  if not entry then
    return
  end

  local staleSuffix = AuctionAssistant.IsStale() and " |cffff4444[stale]|r" or ""
  tooltip:AddLine("Auction Assistant: ~" .. AuctionAssistant.FormatCopper(entry.v) .. staleSuffix, 1, 0.82, 0)
end

if TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum and Enum.TooltipDataType and Enum.TooltipDataType.Object then
  TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Object, function(tooltip, tooltipData)
    if tooltip ~= GameTooltip then
      return
    end
    if not (tooltipData and tooltipData.lines and tooltipData.lines[1]) then
      return
    end
    ShowGatherValue(tooltip, tooltipData.lines[1].leftText)
  end)
end
