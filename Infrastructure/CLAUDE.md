# Infrastructure — Instructions

> External services only: JWT issuance, the SMS gateway, Web Push, and the cache.
> Each one implements an interface declared in `Application/Common/Interfaces`.
> The database lives in `Persistence/`, not here.
> Read the shared rules in [../CLAUDE.md](../CLAUDE.md) first.

---

## 1. Rules

| # | Rule | Meaning in practice |
|---|------|---------------------|
| 1 | **Implement, never declare** | The interface belongs in `Application/Common/Interfaces`; only the implementation lives here. Handlers must never reference an `Infrastructure` type. |
| 2 | **Degrade, don't crash** | A third party being down is not a request failure. Push and SMS swallow and log; `WebPushService` no-ops when VAPID keys are absent; the JWT/auth block is skipped entirely when `JwtSettings` is null (design-time `dotnet ef` runs). |
| 3 | **Config through `IOptions`** | Bind a settings class to a config section (`JwtSettings`, `WebPushOptions`). No `Environment.GetEnvironmentVariable` scattered in service code. |
| 4 | **`HttpClient` via the factory** | `AddHttpClient<TInterface, TImpl>()` so it gets connection pooling and handler rotation. Never `new HttpClient()`. |
| 5 | **Two-tier SMS** | `ISmsService` is the raw gateway. Anything that formats a message or resolves a recipient is a *separate* high-level service. Don't format messages at a call site. |
| 6 | **No secrets in source** | Dev keys in `appsettings.Development.json`; production via Azure app settings (`WebPush__*`, etc.). |

---

## 2. Contents

```
Infrastructure/
├── DependencyInjectionInfrastructure.cs   # AddInfrastructure() — the whole wiring
├── Services/
│   ├── JwtSettings.cs          # bound from the "Jwt" config section
│   ├── JwtTokenGenerator.cs    # IJwtTokenGenerator
│   ├── CacheService.cs         # ICacheService over IDistributedCache
│   └── OneTimeCodeHasher.cs    # IOneTimeCodeHasher — HMAC-SHA256 for SMS reset codes/tickets, key derived from Jwt secret
├── Sms/
│   ├── SmsService.cs                       # ISmsService — raw UBill gateway
│   ├── AdminNotificationSmsService.cs      # "new group order pending" → all admins with a phone
│   ├── RecipientNotificationSmsService.cs  # "courier assigned, 1–3 business days" → recipient
│   └── PasswordResetSmsService.cs          # one-time reset link
└── Push/WebPushService.cs                  # IWebPushService — VAPID Web Push
```

---

## 3. Authentication

`AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(...)` is configured
here and is the application default. Validation: issuer, audience, lifetime, signing key,
30-second clock skew.

**JWT claims** issued by `JwtTokenGenerator`: the standard subject/name/role plus
`courierId`, `customerId`, and `tenantId` where applicable. `BaseController` reads them.

> **The one sanctioned `DateTime.UtcNow`.** `JwtTokenGenerator.cs` sets the token `nbf`/`exp`
> from `DateTime.UtcNow` (not `CustomTime.Now`). This is correct — JWT timestamps are UTC by
> spec and validated against UTC with the 30-second skew. It is the **only** place in the
> solution that legitimately bypasses the `CustomTime` rule; do not "fix" it, and do not copy
> the pattern anywhere that writes a business timestamp.

**SignalR handshake.** WebSocket/SSE connections cannot send an `Authorization` header, so
`JwtBearerEvents.OnMessageReceived` — **scoped to paths under `/hubs`** — pulls the token from:

1. the `hubToken` HttpOnly cookie (preferred; set by `POST /api/auth/hub-cookie`, so the token
   never appears in a URL), then
2. `?access_token=` as a legacy fallback.

Keep the `/hubs` path check. Widening it would accept query-string tokens across the whole API.

The **partner `ApiKey` scheme is registered separately in `API/Program.cs`**, not here — it
needs the DB to resolve a key hash, and `API` is the composition root.

---

## 4. Cache

`AddStackExchangeRedisCache` when `ConnectionStrings:Redis` is set (instance prefix
`DeliveryApp:`), otherwise `AddDistributedMemoryCache`. `CacheService` wraps
`IDistributedCache` behind `ICacheService`.

Queries opt in by implementing `ICacheable` (`CacheKey` + `CacheDuration`); `CachingBehavior`
in `Application` does the rest. Mutating commands must call `ICacheService.RemoveAsync` to
invalidate — nothing invalidates automatically.

---

## 5. SMS (UBill)

`ISmsService.SendSmsAsync(phone, message)` / `GetSmsBalanceAsync()`. Phone numbers include the
country code (`995599123456`). It returns `SmsResult` — a small local success/failure type,
deliberately *not* the app-wide result type, so the SMS layer stays self-contained.

Triggers currently wired: new GroupOrder → admins; courier assigned → recipient;
password reset → the user (6-digit code, valid 5 min; `PasswordResetSmsService` returns the `SmsResult` so the handler can tell the user when the SMS failed — the one SMS service that does not swallow the outcome).

---

## 6. Web Push (VAPID)

Free, standards-based Web Push — no paid service. Used for courier "new order" alerts that
appear on the lock screen with the app closed.

- `PublicKey` is served to the client (`GET /api/push/vapid-public-key`) so it can subscribe.
- `GenerateKeys()` is a one-time admin convenience (`GET /api/push/generate-vapid-keys`).
- `NotifyNewOrderAsync` is best-effort: it swallows failures and **prunes subscriptions the
  push service reports as gone**.
- With no keys configured every method no-ops safely.

Subscriptions are stored as `PushSubscription` rows keyed by endpoint (one per device).
Config: `WebPush` section in dev; `WebPush__*` Azure app settings in production.
**iOS only delivers push to an installed PWA** — the app must be added to the home screen.

The client half lives in `client/src/realtime/pushNotifications.ts` and `client/public/push-sw.js`,
which is layered onto the generated Workbox service worker via `workbox.importScripts`.

---

## 7. Adding an external service

1. Declare the interface in `Application/Common/Interfaces` with XML docs stating the
   failure behaviour (throws? swallows? no-ops?).
2. Implement it here in its own folder.
3. Bind any config to an options class.
4. Register in `AddInfrastructure`. Use `AddHttpClient<,>` if it makes HTTP calls.
5. If it must not slow a request down, hand it to a fire-and-forget notifier registered in
   `API` (see `IOrderAssignmentNotifier`) rather than awaiting it in the handler.

## 8. Do NOT

- Declare an interface here that `Application` should own.
- Touch the database — `Infrastructure` has no `Persistence` reference and should not gain one.
- `new HttpClient()`.
- Let a third-party failure bubble up as a request failure for notifications.
- Remove the `/hubs` path guard on `OnMessageReceived`.
- Commit production keys.
