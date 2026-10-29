local cache = setmetatable({}, { __mode = "k" })
local generations = setmetatable({}, { __mode = "k" })
local loginAttempts = setmetatable({}, { __mode = "k" })
local pendingLoginAdmissions = setmetatable({}, { __mode = "k" })
local resourceGeneration = 1

function getContractVersion()
    return 2
end

local function nowSeconds()
    return getRealTime().timestamp
end

local function nextGeneration(player)
    generations[player] = (generations[player] or 0) + 1
    return generations[player]
end

local function clearPlayerState(player)
    nextGeneration(player)
    cache[player] = nil
    loginAttempts[player] = nil
    pendingLoginAdmissions[player] = nil
    return true
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
    if not sourceResource then return false, "host resource required" end
    local accountId = trustedAccountId(player)
    if not accountId then return false, "no trusted account session" end
    nextGeneration(player)
    return request(player, "POST", "/v1/link-challenges", { accountId = accountId }, function(result, info)
        triggerEvent("mta-discord-identity:link-challenge", resourceRoot, player, result, info.statusCode)
    end)
end

function beginLogin(player)
    if not sourceResource then return false, "host resource required" end
    if not isElement(player) or getElementType(player) ~= "player" then return false, "invalid player" end
    local hostResource = sourceResource
    local connectionGeneration = nextGeneration(player)
    cache[player] = nil
    loginAttempts[player] = nil
    pendingLoginAdmissions[player] = nil
    local started = request(player, "POST", "/v1/login-challenges", { connectionGeneration = connectionGeneration }, function(result, info)
        if result and type(result.challengeId) == "string" and type(result.connectionToken) == "string" and type(result.expiresAt) == "number" then
            loginAttempts[player] = {
                challengeId = result.challengeId,
                connectionToken = result.connectionToken,
                connectionGeneration = connectionGeneration,
                expiresAt = result.expiresAt,
                exchanging = false,
                hostResource = hostResource,
            }
            local publicResult = {
                challengeId = result.challengeId,
                code = result.code,
                expiresAt = result.expiresAt,
                verificationUrl = result.verificationUrl,
            }
            triggerEvent("mta-discord-identity:login-challenge", resourceRoot, player, publicResult, info.statusCode)
        else
            triggerEvent("mta-discord-identity:login-failed", resourceRoot, player, info.statusCode)
        end
    end)
    if not started then triggerEvent("mta-discord-identity:login-failed", resourceRoot, player, 0) end
    return started
end

function exchangeTicket(player, ticket)
    if not sourceResource then return false, "host resource required" end
    if type(ticket) ~= "string" or #ticket > 256 then return false, "invalid ticket" end
    local hostResource = sourceResource
    local accountId = trustedAccountId(player)
    if not accountId then return false, "no trusted account session" end
    nextGeneration(player)
    return request(player, "POST", "/v1/sessions/exchange", { accountId = accountId, ticket = ticket }, function(result, info)
        if result and result.accountId == accountId and type(result.expiresAt) == "number" then
            local caps = {}
            for _, capability in ipairs(result.capabilities or {}) do caps[capability] = true end
            cache[player] = { accountId = accountId, sessionToken = result.sessionToken, expiresAt = result.expiresAt, capabilities = caps, donorTier = result.donorTier, hostResource = hostResource }
            triggerEvent("mta-discord-identity:grants-changed", resourceRoot, player)
        else
            cache[player] = nil
            triggerEvent("mta-discord-identity:session-failed", resourceRoot, player, info.statusCode)
        end
    end)
end

function exchangeLoginTicket(player, ticket)
    if not sourceResource then return false, "host resource required" end
    if type(ticket) ~= "string" or ticket == "" or #ticket > 256 then return false, "invalid ticket" end
    local attempt = loginAttempts[player]
    if not attempt or attempt.exchanging or attempt.connectionGeneration ~= (generations[player] or 0) or attempt.expiresAt <= nowSeconds() then
        return false, "no current login challenge"
    end
    if sourceResource ~= attempt.hostResource then return false, "host resource mismatch" end
    attempt.exchanging = true
    local started = request(player, "POST", "/v1/login-sessions/exchange", {
        ticket = ticket,
        challengeId = attempt.challengeId,
        connectionToken = attempt.connectionToken,
        connectionGeneration = attempt.connectionGeneration,
    }, function(result, info)
        attempt.exchanging = false
        if result and type(result.accountId) == "string" and result.accountId ~= "" and type(result.sessionTicket) == "string" and result.sessionTicket ~= "" then
            loginAttempts[player] = nil
            pendingLoginAdmissions[player] = {
                accountId = result.accountId,
                sessionTicket = result.sessionTicket,
                connectionGeneration = attempt.connectionGeneration,
                activating = false,
                hostResource = attempt.hostResource,
            }
            triggerEvent("mta-discord-identity:login-authorized", resourceRoot, player, result.accountId)
        else
            triggerEvent("mta-discord-identity:login-failed", resourceRoot, player, info.statusCode)
        end
    end)
    if not started then
        attempt.exchanging = false
        triggerEvent("mta-discord-identity:login-failed", resourceRoot, player, 0)
    end
    return started
end

function activateLoginSession(player, accountId)
    if not sourceResource then return false, "host resource required" end
    if not isElement(player) or getElementType(player) ~= "player" then return false, "invalid player" end
    if type(accountId) ~= "string" or accountId == "" or #accountId > 128 then return false, "invalid account" end
    local pending = pendingLoginAdmissions[player]
    if not pending or pending.activating or pending.accountId ~= accountId
        or pending.connectionGeneration ~= (generations[player] or 0) then
        return false, "no matching login admission"
    end
    if sourceResource ~= pending.hostResource then return false, "host resource mismatch" end
    pending.activating = true
    local started = request(player, "POST", "/v1/sessions/exchange", {
        ticket = pending.sessionTicket,
        accountId = pending.accountId,
    }, function(result, info)
        if result and result.accountId == pending.accountId and type(result.sessionToken) == "string"
            and type(result.expiresAt) == "number" and type(result.capabilities) == "table" then
            local caps = {}
            for _, capability in ipairs(result.capabilities) do caps[capability] = true end
            cache[player] = {
                accountId = pending.accountId,
                sessionToken = result.sessionToken,
                expiresAt = result.expiresAt,
                capabilities = caps,
                donorTier = result.donorTier,
                hostResource = pending.hostResource,
            }
            pendingLoginAdmissions[player] = nil
            triggerEvent("mta-discord-identity:login-session-activated", resourceRoot, player, result.accountId)
            triggerEvent("mta-discord-identity:grants-changed", resourceRoot, player)
        else
            pendingLoginAdmissions[player] = nil
            cache[player] = nil
            triggerEvent("mta-discord-identity:login-session-failed", resourceRoot, player, info.statusCode)
        end
    end)
    if not started then
        pendingLoginAdmissions[player] = nil
        triggerEvent("mta-discord-identity:login-session-failed", resourceRoot, player, 0)
    end
    return started
end

local function authorizedEntry(player)
    local callerResource = sourceResource
    local entry = cache[player]
    if not callerResource or not entry or entry.hostResource ~= callerResource or entry.expiresAt <= nowSeconds() then
        return nil
    end
    if trustedAccountId(player) ~= entry.accountId then
        clearPlayerState(player)
        triggerEvent("mta-discord-identity:grants-changed", resourceRoot, player)
        return nil
    end
    return entry
end

function hasCapability(player, capability)
    local entry = authorizedEntry(player)
    return entry ~= nil and type(capability) == "string" and entry.capabilities[capability] == true
end

function getDonorTier(player)
    local entry = authorizedEntry(player)
    if not entry then return nil end
    return entry.donorTier
end

function clearPlayerSession(player)
    if not sourceResource then return false, "host resource required" end
    local entry = cache[player]
    local attempt = loginAttempts[player]
    local pending = pendingLoginAdmissions[player]
    local hostResource = (entry and entry.hostResource) or (attempt and attempt.hostResource) or (pending and pending.hostResource)
    if hostResource and sourceResource ~= hostResource then return false, "host resource mismatch" end
    return clearPlayerState(player)
end

local function refresh(player)
    local entry = cache[player]
    if not entry or entry.expiresAt <= nowSeconds() then
        if entry then clearPlayerState(player); triggerEvent("mta-discord-identity:grants-changed", resourceRoot, player) end
        return
    end
    local accountId = trustedAccountId(player)
    if accountId ~= entry.accountId then clearPlayerState(player); return end
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
        local decoded = type(payload) == "string" and fromJSON(payload) or nil
        local result = info.success and decoded or nil
        if not result or result.accountId ~= accountId then
            local errorCode = type(decoded) == "table" and type(decoded.error) == "table" and decoded.error.code or nil
            local confirmedRevocation = errorCode == "IDENTITY_AUTHORIZATION_REVOKED"
            local revokedAccountId = entry.accountId
            clearPlayerState(player)
            if confirmedRevocation then
                triggerEvent("mta-discord-identity:authorization-revoked", resourceRoot, player, revokedAccountId)
            else
                triggerEvent("mta-discord-identity:grants-changed", resourceRoot, player)
            end
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
addEvent("mta-discord-identity:login-challenge", false)
addEvent("mta-discord-identity:login-authorized", false)
addEvent("mta-discord-identity:login-failed", false)
addEvent("mta-discord-identity:login-session-activated", false)
addEvent("mta-discord-identity:login-session-failed", false)
addEvent("mta-discord-identity:grants-changed", false)
addEvent("mta-discord-identity:session-failed", false)
addEvent("mta-discord-identity:authorization-revoked", false)
addEventHandler("onPlayerQuit", root, function() clearPlayerState(source) end)
addEventHandler("onResourceStop", resourceRoot, function() resourceGeneration = resourceGeneration + 1 end)
setTimer(function() for player in pairs(cache) do refresh(player) end end, IdentityConfig.heartbeatMs, 0)
