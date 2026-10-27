# API — Instructions

> ASP.NET Core host and composition root: thin controllers, the two authentication schemes,
> the SignalR hub, the webhook delivery worker, and the built frontend in `wwwroot/`.
> Read the shared rules in [../CLAUDE.md](../CLAUDE.md) first.

---

## 1. Rules

| # | Rule | Meaning in practice |
|---|------|---------------------|
| 1 | **Controllers are thin** | Read identity from claims → build the request → `Sender.Send(...)` → return. No business `if`s, no DB access, no LINQ over entities. |
| 2 | **Derive from `BaseController`** | It supplies `Sender`, `CurrentUserId`, `CurrentCourierId`, `CurrentTenantId`, plus `[ApiController]` and `[Route("api/[controller]")]`. |
| 3 | **Every action is explicitly authorized** | An `[Authorize(Roles = ...)]`, `[Authorize(Policy = ...)]`, or a deliberate `[AllowAnonymous]`. Never leave it implicit. |
| 4 | **Identity comes from the token** | Customer/courier/tenant scoping reads the JWT claim. Never accept an owner id from the body or query string. |
| 5 | **Errors via exceptions** | Throw `NotFoundException` / `ForbiddenException` / `ConflictException` / `ValidationException` from the handler; `ExceptionHandlingMiddleware` maps them. Don't hand-build error responses. |
| 6 | **Response models are separate types** | Request/response shapes live in `API/Models/`. See the two-layer DTO trap in §5. |
| 7 | **Slow third parties go off-request** | Push and SMS on courier assignment run through `IOrderAssignmentNotifier` (fire-and-forget) so an unresponsive gateway never adds to the admin's response time. |

---

## 2. Contents

```
API/
├── Program.cs                     # composition root: Serilog, CORS, layers, auth, SignalR, Swagger, pipeline
├── Auth/ApiKeyAuthenticationHandler.cs
├── Controllers/                   # 27 controllers, all : BaseController
├── Models/                        # request/response shapes, grouped by area
├── Middleware/ExceptionHandlingMiddleware.cs
├── Realtime/
│   ├── NotificationsHub.cs        # mapped at /hubs/notifications
│   ├── PendingCountsNotifier.cs   # IPendingCountsNotifier  (singleton)
│   └── RealtimeNotifier.cs        # IRealtimeNotifier       (singleton)
├── Notifications/OrderAssignmentNotifier.cs   # IOrderAssignmentNotifier (singleton, fire-and-forget)
├── Webhooks/WebhookSenderService.cs           # BackgroundService draining the outbox
├── Warmup/QueryWarmupService.cs               # BackgroundService: runs the Packages page queries once after
│                                               #   startup so the first real request isn't a ~16 s cold start.
│                                               #   Best-effort; a new heavy admin query shape can be added to it
├── Excel/FinanceExcelBuilder.cs   # shared ClosedXML builder for the finance-export endpoints —
│                                   #   reuse this (or CustomerSettlementsController's older
│                                   #   BuildInvoiceExcel) rather than hand-rolling a new one
├── Excel/CompanyFinanceOrdersExcelBuilder.cs  # Finance → Overview "View orders" export; reuses FinanceExcelBuilder's
│                                   #   Georgian label maps; like it, never carries CourierSalary (or margin = fee − salary)
└── wwwroot/                       # built frontend — produced by `npm run build` (CI builds it on deploy; don't commit rebuilds)
```

---

## 3. Authentication & authorization

**Two schemes.**

- **JWT bearer** (default, configured in `Infrastructure`) — everything user-facing.
- **`"ApiKey"`** (registered in `Program.cs`, handler in `API/Auth/`) — partner endpoints opt in
  with `[Authorize(AuthenticationSchemes = ApiKeyAuthenticationHandler.SchemeName)]`.
  Reads `X-Api-Key`, SHA-256 hashes it, resolves a `customerId` claim — the *same claim shape*
  a customer JWT carries, so downstream handlers are unaware of the difference.

**Roles:** `Admin`, `Operator`, `Courier`, `Customer`, `TenantAdmin`.

**`SystemAdmin` policy** = `Admin` role **and** `ClaimTypes.Name == "systemadmin"`. Guards
Tenants (create/edit), Partner API keys, Partner webhooks, and Tenant Settlements. Ordinary
admins can still `GET /api/tenants` — that read powers the customer-assignment dropdown.

### Operator vs Admin

An **Operator** is back-office staff with near-full admin access: Overview, Pick-Up, Delivery,
Packages, Customers, Couriers, Cities, History, Return/Exchange — with the same actions
(accept/assign/warehouse/cancel batches, assign couriers, set prices and courier salary, mark
delivered, manage couriers and customers, edit cities).

The **only** thing hidden from an operator is **company revenue/margin**, and it is hidden in
*both* places: the UI drops the column (`canSeeRevenue`) **and** the server strips the figure
(`HideCompanyRevenue` on `GetAllOrdersQuery`; `User.IsInRole("Operator")` checks in
`GroupOrdersController` / `CouriersController`). Keep both sides in sync.

**Admin-only** (operators cannot open): company Finance overview, Operators management,
Partner API, Weight Tiers, Tenants.

**TenantAdmin** sees only its own tenant's data, scoped by the `tenantId` JWT claim —
`TenantOrdersController`, `TenantFinanceController`, `TenantBrandingController`, plus
tenant-filtered reads on the shared admin controllers.

---

## 4. Realtime (SignalR)

Hub at `/hubs/notifications`. Three singleton notifiers implement the `Application` interfaces
and are called from the Persistence interceptors:

| Interface | Pushes |
|---|---|
| `IPendingCountsNotifier` | `PendingCounts(PendingGroupOrders, ReturnExchange)` — the staff-nav badges. |
| `IRealtimeNotifier` | Payload-free "refetch" pings: `adminOrdersChanged` to all admins, `courierOrdersChanged` to one courier. |
| `IOrderAssignmentNotifier` | Not SignalR — queues the courier Web Push + recipient SMS in the background. A handler assigning several orders to one courier must call the `*Bulk` methods (one job: one "N new deliveries" push + the SMS loop in one scope), never the single-order method in a loop — N fire-and-forget scopes starved the DB pool and slowed the post-assign list refetches 20–50×. |

Pings carry no data on purpose: the client re-queries through its normal API, so there is one
source of truth for shape and authorization. The frontend subscribes with
`useOrdersChangedSignal` / `useAdminPendingCounts`.

Auth for the handshake uses the `hubToken` HttpOnly cookie — see `API/Controllers/AuthController.cs`
(`POST`/`DELETE /api/auth/hub-cookie`) and `Infrastructure/CLAUDE.md` §3.

---

## 5. ⚠ The two-layer DTO trap

`GroupOrdersController` re-maps the query's `AdminOrderDto` into a **separate**
`AdminGroupOrderResponse` (in `API/Models/GroupOrders/`). A field added to the Application DTO
but not to the response type is **silently dropped from the JSON** — no compile error, no
runtime error, it just never reaches the client.

When adding a field to an admin/customer group-order read, change it in **both** places, and
check the admin *and* customer views.

This has shipped as a bug at least five times (`c6b096e`, `009bfad`, `0f43122`, `5332d05`,
`1bddc47`) — either the field silently vanished from JSON, or `tsc` broke on the client
interface. The full chain a field must travel: **entity → query projection DTO → `API/Models`
response type → `client/src/api/*.ts` interface**, and for the History views also the
**synthetic "standalone Return wrapped as a fake `AdminGroupOrder`"** construction (a Return
has no real parent batch — the History page builds one). Miss any hop and it's a silent drop
or a build break. Grep the field name across all layers before calling it done.

---

## 6. Partner API

Docs for partners: `docs/PARTNER_API.md`.

- **Place/read** — `PartnerOrdersController` at `/api/partner/orders`, reusing
  `CreateGroupOrderCommand`. Partner orders then flow through the normal pipeline with no
  special handling.
- **Stable status set** — internal `OrderStatus` values are collapsed to the public set in
  `Application/PartnerOrders/PartnerOrderStatus.cs`, so internal status churn never breaks a
  partner. Never expose the raw enum.
- **`Order.ExternalReference`** carries the partner's own order number — used for dedup on
  retried submissions and for reconciliation.
- **Webhooks** — transactional outbox. `WebhookOutboxInterceptor` writes `WebhookDelivery` rows
  on status change; `WebhookSenderService` (a `BackgroundService`) drains them, signs with
  HMAC-SHA256 (`X-Webhook-Signature: sha256=<hex>`), and retries with backoff.
  **It assumes a single app instance** — add a lease/claim before sending if this is ever scaled out.

---

## 7. Pipeline order (`Program.cs`)

`ExceptionHandlingMiddleware` → (dev: Swagger) → `UseStaticFiles` → `UseCors("AllowFrontend")`
→ `UseHttpsRedirection` → `UseAuthentication` → `UseAuthorization` → `MapControllers`
→ `MapHub<NotificationsHub>("/hubs/notifications")` → `MapFallbackToFile("index.html")`.

The exception handler is first so it wraps everything. The fallback is last so unmatched
routes serve the SPA.

CORS allows `http://localhost:3000` and `https://localhost:3000` plus the `AllowedOrigins`
config array, with credentials (required for the hub cookie). The Vite dev server actually
runs on **3100** and proxies instead, so it does not need a CORS entry.

Enums serialize as strings via `JsonStringEnumConverter`, on both MVC and the SignalR JSON
protocol (which additionally uses camelCase).

## 8. Do NOT

- Put business logic, a DB query, or a status transition in a controller.
- Add an endpoint without an explicit authorization attribute.
- Take a customer/courier/tenant id from the request instead of the token.
- Add a field to a group-order DTO without also adding it to the response model.
- Expose the internal `OrderStatus` enum through a partner endpoint.
- Assume more than one app instance for webhook delivery without adding a claim/lease first.
