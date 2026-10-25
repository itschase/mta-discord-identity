-- Copy to an operator-controlled server file or inject with server settings.
-- Never place real secrets in downloadable client files, element data, or URLs.
IdentityConfig = {
    baseUrl = "https://identity.example.invalid",
    installationSecret = "",
    requestTimeoutMs = 5000,
    heartbeatMs = 60000,
    staleGraceMs = 0,
}
