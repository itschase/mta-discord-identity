local cache = setmetatable({}, { __mode = "k" })
local generations = setmetatable({}, { __mode = "k" })
local resourceGeneration = 1

local function nowSeconds()
    return getRealTime().timestamp
end

local function nextGeneration(player)
    generations[player] = (generations[player] or 0) + 1
    return generations[player]
end

local function trustedAccountId(player)
    -- Host resources provide this event. They must derive IDs from server-side login state.
    local result
    triggerEvent("mta-discord-identity:resolve-account", resourceRoot, player, function(accountId)
        result = accountId
    end)
    if type(result) ~= "string" or result == "" then return nil end
    return result
end

local function request(player, method, path, body, onDone)
    if not isElement(player) then return false end
    local playerGeneration = generations[player] or 0
    local startGeneration = resourceGeneration
    local options = {
        method = method,
        headers = {
            ["Authorization"] = "Bearer " .. IdentityConfig.installationSecret,
            ["Content-Type"] = "application/json",
            ["X-Request-Id"] = tostring(getTickCount()) .. ":" .. tostring(math.random(100000, 999999)),
        },
        postData = body and toJSON(body, true) or "",
        connectionAttempts = 1,
        connectTimeout = IdentityConfig.requestTimeoutMs,
        queueName = "mta-discord-identity",
    }
    return fetchRemote(IdentityConfig.baseUrl .. path, options, function(payload, info)
        if resourceGeneration ~= startGeneration or not isElement(player) or generations[player] ~= playerGeneration then return end
        local decoded = info.success and fromJSON(payload) or nil
        onDone(decoded, info)
    end)
end

function beginLink(player)
    if sourceResource and client then return false, "server-only export" end
    local accountId = trustedAccountId(player)
    if not accountId then return false, "no trusted account session" end
    nextGeneration(player)
    return request(player, "POST", "/v1/link-challenges", { accountId = accountId }, function(result, info)
        triggerEvent("mta-discord-identity:link-challenge", resourceRoot, player, result, info.statusCode)
    end)
end

function exchangeTicket(player, ticket)
    if sourceResource and client then return false, "server-only export" end
    if type(ticket) ~= "string" or #ticket > 256 then return false, "invalid ticket" end
    local accountId = trustedAccountId(player)
    if not accountId then return false, "no trusted account session" end
    nextGeneration(player)
    return request(player, "POST", "/v1/sessions/exchange", { accountId = accountId, ticket = ticket }, function(result, info)
        if result and result.accountId == accountId and type(result.expiresAt) == "number" then
            local caps = {}
            for _, capability in ipairs(result.capabilities or {}) do caps[capability] = true end
            cache[player] = { accountId = accountId, sessionToken = result.sessionToken, expiresAt = result.expiresAt, capabilities = caps, donorTier = result.donorTier }
            triggerEvent("mta-discord-identity:grants-changed", resourceRoot, player)
        else
            cache[player] = nil
            triggerEvent("mta-discord-identity:session-failed", resourceRoot, player, info.statusCode)
        end
    end)
end

function hasCapability(player, capability)
    local entry = cache[player]
    return entry ~= nil and entry.expiresAt > nowSeconds() and entry.capabilities[capability] == true
end

function getDonorTier(player)
    local entry = cache[player]
    if not entry or entry.expiresAt <= nowSeconds() then return nil end
    return entry.donorTier
end

function clearPlayerSession(player)
    nextGeneration(player)
    cache[player] = nil
    return true
end

local function refresh(player)
    local entry = cache[player]
    if not entry or entry.expiresAt <= nowSeconds() then
        if entry then clearPlayerSession(player); triggerEvent("mta-discord-identity:grants-changed", resourceRoot, player) end
        return
    end
    local accountId = trustedAccountId(player)
    if accountId ~= entry.accountId then clearPlayerSession(player); return end
    -- fetchRemote cannot safely start dependent work from the same queue callback;
    -- every heartbeat is an independent timer invocation.
    local options = {
        method = "POST",
        headers = {
            ["Authorization"] = "Bearer " .. IdentityConfig.installationSecret,
            ["X-Session-Token"] = entry.sessionToken,
            ["Content-Type"] = "application/json",
        },
        postData = "{}",
        connectionAttempts = 1,
        connectTimeout = IdentityConfig.requestTimeoutMs,
        queueName = "mta-discord-identity-heartbeat",
    }
    local generation = generations[player] or 0
    fetchRemote(IdentityConfig.baseUrl .. "/v1/sessions/refresh", options, function(payload, info)
        if not isElement(player) or generations[player] ~= generation then return end
        local result = info.success and fromJSON(payload) or nil
        if not result or result.accountId ~= accountId then
            clearPlayerSession(player)
            triggerEvent("mta-discord-identity:grants-changed", resourceRoot, player)
            return
        end
        local caps = {}
        for _, capability in ipairs(result.capabilities or {}) do caps[capability] = true end
        entry.capabilities, entry.donorTier, entry.expiresAt = caps, result.donorTier, result.expiresAt
        triggerEvent("mta-discord-identity:grants-changed", resourceRoot, player)
    end)
end

addEvent("mta-discord-identity:resolve-account", false)
addEvent("mta-discord-identity:link-challenge", false)
addEvent("mta-discord-identity:grants-changed", false)
addEvent("mta-discord-identity:session-failed", false)
addEventHandler("onPlayerQuit", root, function() clearPlayerSession(source) end)
addEventHandler("onResourceStop", resourceRoot, function() resourceGeneration = resourceGeneration + 1 end)
setTimer(function() for player in pairs(cache) do refresh(player) end end, IdentityConfig.heartbeatMs, 0)
