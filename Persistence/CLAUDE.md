# Persistence — Instructions

> The database, and only the database: `AppDbContext`, the EF Core model configuration,
> 69 migrations, three `SaveChanges` interceptors, and Identity wiring.
> External services live in `Infrastructure/`, not here.
> Read the shared rules in [../CLAUDE.md](../CLAUDE.md) first.

---

## 1. Rules

| # | Rule | Meaning in practice |
|---|------|---------------------|
| 1 | **Database only** | If it talks to something outside the DB (SMS, push, HTTP, JWT), it belongs in `Infrastructure`. |
| 2 | **`AppDbContext` implements `IAppDbContext`** | Handlers depend on the interface. A new `DbSet` must be added to **both**. |
| 3 | **Never edit an applied migration** | Add a new one. |
| 4 | **Configure in `OnModelCreating`** | Keys, indexes, `HasMaxLength`, `decimal(18,2)`, delete behaviour, `HasConversion<string>()`. There are no `IEntityTypeConfiguration` files — everything is inline, grouped by entity with a `// ── Entity ──` banner. Follow that layout. |
| 5 | **Enums persist as `varchar` names** | `HasConversion<string>().HasMaxLength(n).IsUnicode(false)`. Names, not numbers — which is why retired enum slots are safe to leave empty. |
| 6 | **Money is `decimal(18,2)`** | Every currency column. Weights are `decimal(18,3)`. |
| 7 | **Interceptors react to changes; handlers don't** | Anything that must happen on *every* order change goes in an interceptor, not scattered across handlers. |
| 8 | **No lazy loading** | It is not enabled; do not enable it. |

---

## 2. Contents

```
Persistence/
├── AppDbContext.cs                  # IdentityDbContext<ApplicationUser> + IAppDbContext
├── AppDbContextFactory.cs           # design-time factory — walks up to find API/appsettings.json
├── DependencyInjectionPersistence.cs# AddPersistence() + SeedAsync()
├── Interceptors/
│   ├── PendingCountsChangeInterceptor.cs
│   ├── RealtimeDashboardInterceptor.cs
│   └── WebhookOutboxInterceptor.cs
├── Services/TrackingNumberGenerator.cs
└── Migrations/                      # 69 migrations + AppDbContextModelSnapshot
```

**Provider:** SQL Server (`UseSqlServer`) with `EnableRetryOnFailure(3)` and a 30s command timeout.

---

## 3. The three `SaveChanges` interceptors

All three are **scoped** (one per `DbContext`, so their per-save state is single-threaded)
and all follow the same shape: detect in `SavingChanges` (while original values are still
available), act in `SavedChanges` (so nothing fires for a rolled-back change).

| Interceptor | Detects | Does |
|---|---|---|
| `PendingCountsChangeInterceptor` | Insert/update of a `GroupOrder` or a Return/Exchange `Order` | Pushes refreshed admin badge counts over SignalR via `IPendingCountsNotifier`. Replaced 30-second client polling. |
| `RealtimeDashboardInterceptor` | Any order-set change; courier assignment/reassignment | `NotifyAdminsOrdersChanged()` to all admins, `NotifyCourierOrdersChanged(id)` to the courier gained *and* the one lost. Payload-free — clients refetch through their normal API. |
| `WebhookOutboxInterceptor` | `Order.Status` transitions | Writes one `WebhookDelivery` outbox row per active partner webhook, in a **fresh scope after commit**. `API/Webhooks/WebhookSenderService` drains them. |

Handlers may also ping explicitly through `IRealtimeNotifier` when a change isn't visible to
the interceptor. Prefer a new interceptor or an explicit ping over sprinkling notification
logic through handlers.

---

## 4. Identity

`AddIdentityCore<ApplicationUser>` — **not** `AddIdentity`. `AddIdentity` overwrites JWT bearer
with cookie auth and redirects to `/Account/Login`; `AddIdentityCore` gives user/role
management and leaves JWT as the scheme. Do not change this.

Password policy (8+, upper, lower, digit, symbol; 5 failed attempts → 15-minute lockout;
unique email) is mirrored in `Application/Common/Validation/PasswordRules` so violations
surface as friendly 422 field errors instead of opaque Identity errors, and mirrored again in
`client/src/utils/passwordRules.ts`. **Change all three together.**

`DataProtectionTokenProviderOptions.TokenLifespan = 2h` governs password-reset /
email-confirmation tokens only — JWT lifetime is configured separately in `Infrastructure`.

---

## 5. Seeding (`SeedAsync`, idempotent, runs on every start)

- Roles: `Admin`, `Operator`, `Courier`, `Customer`, `TenantAdmin`.
- `admin` — default full admin. Phone comes from config key `AdminSeed:PhoneNumber` so it can
  change without a deploy; empty just means admin SMS alerts don't fire.
- `systemadmin` — a second Admin-role account that additionally owns Tenants / Partner API /
  Tenant Settlements via the `SystemAdmin` policy. Its hash is set directly rather than through
  `CreateAsync(user, password)` so the requested credential is honoured verbatim.
- `livo` — the demo `TenantAdmin` co-admin plus its `Tenant` (`livo.ge`). Idempotency keys off
  the **user**, not the host, so an admin can rename the tenant's host without the seed
  re-creating it.

---

## 6. Migrations

```powershell
dotnet ef migrations add <Name> --project Persistence --startup-project API
dotnet ef database update      --project Persistence --startup-project API
```

**Stop the running API first** — `dotnet ef` builds the startup project and will fail with
MSB3026 while `API/bin` is locked.

**Production policy:** migrations apply automatically in Development. In production they run
only when `RUN_MIGRATIONS=true` is set. If migrations are pending without the flag, startup
logs a warning and continues. This is deliberate — do not make production auto-migrate.

---

## 7. `TrackingNumberGenerator`

Format `DL` + 5 random alphanumerics (e.g. `DL12A3G`). Short codes have no global uniqueness
guarantee, so `GenerateManyAsync` generates a batch, checks it against existing
`Order.TrackingNumber`s in **one** query, and regenerates only collisions — no per-number
round trip. A `TrackingNumberSeq` sequence exists in the model from an earlier design and is
not currently used by the generator.

## 7a. Global query filters — `Order` and `GroupOrder` soft delete

`Order` and `GroupOrder` each carry a nullable `DateDeleted` (admin "Delete Package" page) and
a **global `HasQueryFilter(x => x.DateDeleted == null)`** in `OnModelCreating`. This is a
deliberate exception to the per-handler `.Where(x => x.DateDeleted == null)` style used for
`City`/`District`/`Courier` — `Order` is queried in 80+ files and manual filtering could not
guarantee a deleted package stays hidden everywhere (finance projections, history, courier app,
public tracking, Partner API all inherit the filter for free).

- The `GroupOrder` filter is only `DateDeleted == null`. The "batch disappears once its last
  live child is deleted" rule is enforced by `SoftDeleteOrderCommandHandler` stamping the
  parent, **not** by a subquery in the filter.
- To see soft-deleted rows (there is no restore feature — kept only for finance/audit), use
  `.IgnoreQueryFilters()`. Nothing in the app currently does.
- `PaymentReceiptAllocation` has no filter; its `Order` navigation resolves to `null` for a
  soft-deleted order. `GetPaymentReceiptsQuery` already null-guards every `a.Order?.` access.

## 8. Do NOT

- Edit an applied migration.
- Add an external-service implementation here.
- Add a `DbSet` to `AppDbContext` without also adding it to `IAppDbContext`.
- Switch `AddIdentityCore` back to `AddIdentity`.
- Enable lazy loading.
- Make production migrate without `RUN_MIGRATIONS=true`.
