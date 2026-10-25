-- Replace this function with your gamemode's trusted, server-side session lookup.
local function resolveLocalAccountId(player)
    local account = getPlayerAccount(player)
    if not account or isGuestAccount(account) then return nil end
    return getAccountName(account)
end

addEventHandler("mta-discord-identity:resolve-account", root, function(player, reply)
    if source ~= getResourceRootElement(getResourceFromName("mta-discord-identity")) then return end
    reply(resolveLocalAccountId(player))
end)

-- Capability is only one predicate. The host still checks target, state, faction,
-- duty, proximity, ownership, price, etc. for each gameplay operation.
function mayViewReports(player)
    return exports["mta-discord-identity"]:hasCapability(player, "staff.reports.view")
end
