# Discord protocol sources

Implementation was checked against Discord's current official documentation on 2026-10-26:

- [OAuth2](https://docs.discord.com/developers/topics/oauth2) — authorization endpoint, state validation, authorization-code exchange, form-encoded token endpoint, and server-side client authentication.
- [Guild resource](https://docs.discord.com/developers/resources/guild#get-guild-member) — targeted guild-member lookup and the member object's role ID array.
- [Gateway events](https://docs.discord.com/developers/events/gateway-events#guild-member-update) — member update/removal payloads and the `GUILD_MEMBERS` intent requirement for those events.
- [Discord Social SDK authentication](https://discord.com/developers/docs/social-sdk/classdiscordpp_1_1Client.html) — Discord's documented S256 code-verifier/code-challenge pattern.

The service uses the targeted HTTP member lookup for its implemented heartbeat-bounded revocation. Gateway events are documented as a future latency optimization and are not claimed as running behavior.
