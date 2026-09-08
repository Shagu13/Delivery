# Delivery (Dilo) — Project Instructions

> Courier pickup and last-mile delivery platform for Georgia. Bilingual (Georgian / English),
> mobile-first, PWA-installable, white-label capable.
> This document is the **shared overview**. The detailed rules live in six per-project
> `CLAUDE.md` files, listed in §0 — this file alone is not enough to work in this repo.

> **Repo:** `C:\Users\User\OneDrive\Desktop\Delivery` — GitHub `Shagu13/Delivery`, branch `master`.
> Deployed to Azure Web App `Dilo-delivery` by `.github/workflows/api-deploy.yml` on every push to `master`.

---

## 0. ⚠ READ THE SIX PROJECT DOCS FIRST — THIS IS YOUR FIRST ACTION

**Before you answer any question about this codebase, and before you make any change, read
all six files below.** Issue them as parallel `Read` calls in a single message — it is one
round trip.

```
Domain/CLAUDE.md
Application/CLAUDE.md
Persistence/CLAUDE.md
Infrastructure/CLAUDE.md
API/CLAUDE.md
client/CLAUDE.md
```

This is not optional background reading. Each file carries rules, traps, and cross-layer
couplings that this overview only names in passing — the two-layer DTO that silently drops
fields, the co-located CSS that makes modals render unstyled, the two last-mile pages that
both need the same fix, the finance formulas that must never be re-derived outside
`OrderFinance`. A change that looks like a one-line fix is exactly where these bite.

Rules for this read:

- **Read all six even for a small task.** You cannot tell from the task description which
  layer a change will touch; most changes here cross at least two.
- **Read them even if a subdirectory doc appears to be loaded already.** Auto-loading is
  triggered by file access and only covers directories you have already opened.
- **Re-read this root file from disk if it was edited during the session** — the copy injected
  at session start goes stale the moment someone changes it.
- **Never claim to have read a file you did not open.** If you skip one, say which and why.
- All seven `CLAUDE.md` files (this one + the six) are **version-controlled** — edits show in
  `git diff` and get pushed. Keep them current: when a change contradicts something here, fix
  the doc in the same commit.

Only skip the read for questions that do not involve the codebase at all (e.g. "what's the
git status", "what did we just change").

| Project | Layer | Doc |
|---|---|---|
| `Domain/` | Entities, enums, `CustomTime` | [Domain/CLAUDE.md](Domain/CLAUDE.md) |
| `Application/` | CQRS use cases (MediatR), DTOs, validators, finance rules | [Application/CLAUDE.md](Application/CLAUDE.md) |
| `Persistence/` | EF Core `AppDbContext`, migrations, interceptors | [Persistence/CLAUDE.md](Persistence/CLAUDE.md) |
| `Infrastructure/` | JWT, SMS, Web Push, cache | [Infrastructure/CLAUDE.md](Infrastructure/CLAUDE.md) |
| `API/` | Controllers, auth schemes, SignalR, webhook worker | [API/CLAUDE.md](API/CLAUDE.md) |
| `client/` | React 19 + TypeScript SPA | [client/CLAUDE.md](client/CLAUDE.md) |

Partner-facing API docs: `docs/PARTNER_API.md` (read when touching the Partner API).

### Project skills — check these too

This repo also ships **project-specific skills** under `.claude/skills/*/SKILL.md`. They are
narrower than the six docs above — each is a step-by-step workflow for one recurring task, and
several exist precisely to stop a mistake the six docs only warn about in passing. Skim the
table below against the task before starting; if one matches, invoke it with the `Skill` tool
(or read the file directly) rather than reconstructing the workflow from scratch.

| Skill | Use when |
|---|---|
| `.claude/skills/ef-migration/SKILL.md` | A `Domain` entity or `DbContext` model change needs an EF Core migration. |
| `.claude/skills/new-admin-view/SKILL.md` | Adding a new sidebar view/page to the Admin dashboard. |
| `.claude/skills/packages-page-dual-fix/SKILL.md` | Fixing search/grouping/assign/export/pricing bugs in `AdminPackagesPage.tsx` or `AdminOrdersPage.tsx` — the two duplicate last-mile pages (roadmap §6 phase 9). |
| `.claude/skills/packages-page-consolidation/SKILL.md` | The user asks to actually merge/retire one of those two pages, not just fix a bug in both. |
| `.claude/skills/finance-guardrail/SKILL.md` | Touching `OrderFinance.cs`, `CustomerSettlements`, `CourierSettlement` projections, `PaymentReceipt`, or the Finance Excel export. |

This list is a pointer, not a substitute — re-run `Glob(".claude/skills/**/SKILL.md")` if it
looks stale, since new skills won't retroactively appear here.

---

## 1. Non-Negotiable Engineering Rules

These apply to **every** change, backend and frontend.

| # | Rule | Meaning in practice |
|---|------|---------------------|
| 1 | **Clean Architecture** | Dependency direction is `Domain ← Application ← (Persistence / Infrastructure) ← API`. Inner layers never reference outer ones. |
| 2 | **.NET 10 / React 19** | Backend targets `net10.0`; frontend is React 19 + TypeScript on Vite. |
| 3 | **CQRS via MediatR** | Every use case is an `IRequest` + one handler. Controllers only `Sender.Send(...)`. No business logic in controllers. |
| 4 | **EF Core + SQL Server** | The only data-access technology. No raw ADO.NET; raw SQL only via parameterized `FromSqlInterpolated` when LINQ genuinely cannot express it. |
| 5 | **Single Responsibility** | One class = one reason to change. One handler = one use case. Split anything that grows a second job. |
| 6 | **DRY** | Shared behaviour goes in one reusable place (pipeline behaviours, shared policies, `OrderFinance`, UI components, custom hooks). Never copy-paste logic. |
| 7 | **No duplicates** | Search for an existing equivalent before writing new code. Two pages already drifted apart this way — see [client/CLAUDE.md](client/CLAUDE.md) §"Known duplication". |
| 8 | **No DB calls inside loops** | Never query or save inside a `for`/`foreach`. Load the rows you need in one query before the loop, mutate in memory, `SaveChangesAsync` once after. |
| 9 | **Surgical edits** | Make targeted edits. Do **not** rewrite whole files. |
| 10 | **Type safety** | `Nullable` is enabled everywhere on the backend; TypeScript on the frontend with no `any` unless justified by a comment. |

> If a rule and a feature request conflict, raise it — then do what the user decides.

---

## 2. Commands

### Backend

```powershell
# Build a project. Do NOT run `dotnet build` at the repo root — the solution
# (Delivery.slnx) registers client/ as a .NETFramework "Website" project, so a
# root build fails with MSB4249. Build the project you need directly:
dotnet build API/API.csproj
dotnet build Application/Application.csproj   # or Persistence/, Domain/, Infrastructure/

# Run the API (serves both the API and the built frontend)
dotnet run --project API

# Tests — use the TEST solution, not Delivery.slnx
dotnet test Delivery.Tests.slnx

# EF Core migrations (stop the API first — see the lock warning below)
dotnet ef migrations add <MigrationName> --project Persistence --startup-project API
dotnet ef database update --project Persistence --startup-project API
```

> **While the API is running** it locks `API/bin/*.dll`, so any build that writes there —
> `dotnet build API`, `dotnet ef ...` (which builds the startup project) — fails with
> MSB3026 "file in use". To check that a *backend* change compiles without stopping the app,
> build a library project directly (`Application`, `Persistence`, …); those write to their own `bin`.

### Frontend

```powershell
cd client
npm install       # first time
npm run dev       # Vite dev server on http://localhost:3100
npm run build     # tsc -b + vite build  →  outputs to ../API/wwwroot
npm run lint      # ESLint
```

In development Vite proxies `/api/*` and `/hubs/*` (WebSocket upgrade included) to
`https://localhost:7100`. In production the API serves `API/wwwroot` via `UseStaticFiles()`
+ `MapFallbackToFile("index.html")`.

> **Do not run frontend build / type-check / lint to "verify" a change** — the user builds
> themselves. Committing rebuilt `API/wwwroot` assets is part of a frontend commit.

---

## 3. Solution Structure

```
Delivery.slnx              # app solution (registers client/ as a Website project → don't root-build)
Delivery.Tests.slnx        # the one to use for `dotnet test`
│
├── Domain/                # Entities, enums, CustomTime. References only EF Core (for [Index]).
├── Application/           # MediatR handlers, DTOs, FluentValidation validators, finance rules
├── Persistence/           # AppDbContext (+ Identity), 69 migrations, 3 SaveChanges interceptors
├── Infrastructure/        # JWT, SMS (UBill), Web Push (VAPID), Redis/memory cache
├── API/                   # Controllers, ApiKey auth handler, SignalR hub, webhook BackgroundService
│   └── wwwroot/           # the built frontend (committed)
├── client/                # React 19 + TS + Vite SPA (PWA)
├── tests/
│   ├── Application.UnitTests/     # xUnit + EF in-memory
│   └── API.IntegrationTests/      # xUnit + EF in-memory
└── docs/PARTNER_API.md
```

**Dependency rules** — `Domain` references nothing app-level; `Application` → `Domain`;
`Persistence` → `Application` + `Domain`; `Infrastructure` → `Application`;
`API` → `Application` + `Persistence` + `Infrastructure` (composition root only).

---

## 4. Domain Overview (the part everything else is built around)

**GroupOrder** = a batch a customer places. **Order** = one package inside it.
Both share one `OrderStatus` enum.

- **Pickup flow** (GroupOrder + its child Orders mirror it):
  `Pending → AcceptedGroupOrder → CourierAssignedToPickUp → CourierDeliveringToWarehouse
  → DeliveredToWarehouse → AdminAcceptedOrderInWareHouse`
- **Last-mile flow** (per Order, starts at `AdminAcceptedOrderInWareHouse`):
  `[non-Tbilisi: OrderIsOnItsWayToRecipientsCity →] CourierAssignedToDeliver
  → CourierDeliveringTheOrderToRecipient → DeliveredToRecipient`, with a `DeliveryPostponed` retry loop.
- **Standalone Return flow** (skips the batch):
  `Pending → CourierAssignedToPickUp → PickedUpFromRecipient
  → DeliveredReturnOrderToWarehouse → ReturnedToSender`
- The **pickup courier** (`GroupOrder.CourierId`) is a different person from the
  **last-mile courier** (`Order.CourierId`). Finance attribution keys off `Order.CourierId`.

**Order ownership — always OR both paths:**
`o.GroupOrder!.CustomerId == customerId || o.CustomerId == customerId`
(Send/Exchange own the customer through the batch; standalone Returns own it directly.)

**Completion timestamps — always fall back:** `o.DeliveredAt ?? o.DeliveredToWarehouseAt`.

**Roles:** `Admin`, `Operator`, `Courier`, `Customer`, `TenantAdmin`. Plus a `SystemAdmin`
authorization policy = Admin role *and* username `systemadmin` (owns Tenants, Partner API,
Tenant Settlements). See [API/CLAUDE.md](API/CLAUDE.md) for the exact matrix.

**Time:** every server timestamp comes from `Domain.CustomTime.Now` / `.Today`
(Georgian Standard Time, UTC+4, no DST) — never `DateTime.Now`/`UtcNow`, the host runs in UTC.
Values persist as Georgian wall-clock with no offset, so a plain `.Date` comparison against a
Georgian day is correct in EF queries. The frontend mirrors this in `client/src/utils/georgianTime.ts`.

---

## 5. Definition of Done

**Backend**
- Goes through MediatR; the controller is thin.
- A `sealed` FluentValidation validator exists for every command with a **non-identifier
  payload** — any field beyond route/claim identifiers (`Guid Id`, `string CourierUserId`):
  a money/decimal value, free text, a collection, an enum, a date. Identifier-only commands
  (e.g. `AcceptGroupOrderCommand`, `RetryDeliveryCommand`) intentionally have none — the id
  already 404s. See [Application/CLAUDE.md](Application/CLAUDE.md) §3.1.
- No DB call inside a loop, no N+1.
- Authorization attribute present and correct for every endpoint.
- Query returns a DTO — never an entity.
- Unit test for handler logic where the logic is non-trivial; integration test for the endpoint where meaningful.
- No duplicated logic introduced.

**Frontend**
- Responsive down to a phone (this is a courier app — mobile is the primary device).
- Loading / empty / error states handled.
- All copy through `t.*` translation keys in both `ka` and `en` — no hardcoded strings.
- Server data through TanStack Query with a stable query key; mutations invalidate it.
- API call lives in `client/src/api/*.ts`, not inline in the component.
- Role guarding correct in both `ProtectedRoute` and the backend attribute.

---

## 6. Development Roadmap

> **Inferred**, not authoritative — reconstructed from git history and what is visibly
> in flight. Treat it as orientation, and correct it when the user says otherwise.

**Shipped (phases 0–7)**
0. Foundation — Clean Architecture solution, MediatR pipeline, EF Core + SQL Server, Identity + JWT, Serilog.
1. Core logistics — GroupOrder pickup flow, per-Order last-mile flow, couriers, warehouses, cities/districts.
2. Portals — Admin (17 views), Courier (PWA), Customer, public tracking.
3. Pricing — district defaults, customer negotiated rates, weight price tiers, capital/city/district zones, pickup-swap pricing.
4. Returns & Exchanges — standalone Return flow, Exchange type, returned-to-sender marking.
5. Realtime — SignalR pending counts + "orders changed" refetch pings; Web Push (VAPID) courier alerts.
6. Partner API — `X-Api-Key` scheme, public status set, transactional-outbox webhooks.
7. Finance rebuild — **CourierSettlement / CustomerSettlement tables dropped**; finance is now
   per-order fields on `Order`, derived live through `Application/Finance/OrderFinance.cs`
   and the two live projections. `PaymentReceipt` records each admin pay/settle action.

**In flight**
8. **White-label tenancy** — `Tenant` + `Customer.TenantId` + `TenantSettlement` exist; the
   `livo.ge` co-admin routes into the real `AdminDashboard` with a restricted 6-view sidebar
   (`TENANT_VIEWS`), and edits its own homepage (`Tenant.HomepageJson`), which `HomeRoute`
   serves by host. Remaining: broader tenant-scoped reporting.
9. **Packages page consolidation** — `AdminPackagesPage` (`packages`) and `AdminOrdersPage`
   (`delivery`) are two implementations of the last-mile page with drifting duplicate logic.
   Both are still routed. Fix search/grouping/assign bugs in **both** until one is retired.

**Not started / open**
- Multi-instance scale-out: `WebhookSenderService` assumes a single app instance (needs a
  lease/claim before sending) and SignalR would need a Redis backplane.
- Test coverage is thin — 4 test files (~87 tests: `GroupOrderOrderBuilderTests`,
  `PackageSoftDeleteTests`, `ReturnOrderVisibilityTests`, `CreateGroupOrderFlowTests`).
  New non-trivial handler logic should add to it.
- **Frontend `features/` layer** — planned, incremental adoption of a Bulletproof-React-style
  `features/<use-case>/` folder (api + hooks + UI per use-case) to stop the recurring drift
  between `AdminPackagesPage.tsx` and `AdminOrdersPage.tsx`. See
  [client/CLAUDE.md §3.1](client/CLAUDE.md#31-planned-direction-a-features-layer-not-started-yet).
  No files moved yet — extract into it opportunistically when next touching shared last-mile
  logic, not as a standalone migration pass.

---

## 7. Conventions (all layers)

- Always `sealed` on handlers and validators.
- No `var` unless the type is obvious from the right-hand side.
- FluentValidation for every command with a non-identifier payload (see §5); validators are `sealed`.
- Enums serialized as strings everywhere (`JsonStringEnumConverter`) **and** persisted as
  strings (`HasConversion<string>()`, `varchar`).
- API calls live in `client/src/api/*.ts` service files, never inline in components.
- CSS variables in `client/src/styles/theme.css`; component-scoped `.css` files next to the component.
- FiraGO (`@fontsource/firago`) — covers Georgian + Latin.
- Commit directly to `master` and push; no feature branches.

## 8. Do NOT

- Put logic in Domain entities — they are data only.
- Return entities from queries — always project to a DTO.
- Reintroduce snapshot/computed finance columns on an aggregate table. Finance is derived live
  from `Order` through `OrderFinance`; that was a deliberate migration away from stale snapshots.
- Rewrite entire files — surgical edits only.
- Touch the persisted query-cache setup (`client/src/queryClient.ts`, the
  `PersistQueryClientProvider` wiring in `App.tsx`, IndexedDB persistence) unless asked.
- Query or save through a `DbContext` inside a loop.
- Run `dotnet build` at the repo root, or `dotnet test Delivery.slnx`.
