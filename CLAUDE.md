# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (.NET 10)
```powershell
# Build a project. Do NOT run `dotnet build` at the repo root — the solution
# (Delivery.slnx) registers client/ as a .NETFramework "Website" project, so a
# root build fails with MSB4249. Build the project you need directly:
dotnet build API/API.csproj
dotnet build Application/Application.csproj   # or Persistence/, Domain/, Infrastructure/

# Run the API (serves both API and frontend in production)
dotnet run --project API

# Add a new EF Core migration
dotnet ef migrations add <MigrationName> --project Persistence --startup-project API

# Apply pending migrations manually
dotnet ef database update --project Persistence --startup-project API
```

> **While the API is running** (`dotnet run --project API`), it locks `API/bin/*.dll`,
> so any build that writes there — `dotnet build API`, `dotnet ef ...` (which builds
> the startup project), etc. — fails with MSB3026 "file in use". To verify a *backend*
> change compiles without stopping the app, build a library project directly
> (`Application`, `Persistence`, …); those write to their own `bin`. To run EF
> migration commands, stop the API first.

### Frontend (React + Vite, in `client/`)
```powershell
cd client
npm install       # first time
npm run dev       # dev server on http://localhost:3000
npm run build     # type-check + production bundle
npm run lint      # ESLint
```

In development, Vite proxies `/api/*` to the .NET backend. The backend serves the built frontend (`client/dist`) as static files in production via `app.MapFallbackToFile("index.html")`.

## Architecture

### Solution structure
| Project | Role |
|---|---|
| `Domain` | Entity classes and enums — no dependencies |
| `Application` | CQRS handlers (MediatR), DTOs, validators (FluentValidation), interfaces |
| `Persistence` | EF Core `AppDbContext`, migrations, seeding |
| `Infrastructure` | JWT, SMS service, Redis/memory cache, concrete interface implementations |
| `API` | ASP.NET Core controllers, middleware, host setup |
| `client/` | React 19 + TypeScript SPA (Vite, React Router v7) |

### CQRS pattern
All business logic lives in `Application` as MediatR `IRequest<T>` commands/queries and their handlers. Controllers are thin — they extract the caller's identity, build the request object, call `Sender.Send(...)`, and return the result. MediatR pipeline behaviors (in order): `LoggingBehavior` → `ValidationBehavior` → `CachingBehavior`.

Controllers derive from `BaseController` (`API/Controllers/BaseController.cs`), which is decorated `[ApiController]` + `[Route("api/[controller]")]` and exposes:
- `Sender` — lazily resolved `ISender` (no constructor injection needed)
- `CurrentUserId` — `ApplicationUser.Id` from the JWT `sub` claim
- `CurrentCourierId` — domain `Courier.Id` from the JWT `courierId` claim (Courier endpoints only)

### Time
All server timestamps come from `Domain.CustomTime.Now` / `.Today` (Georgian Standard Time, UTC+4, no DST) — never `DateTime.Now`/`UtcNow` (the host runs in UTC). Values are persisted and serialized as Georgian wall-clock **without an offset**, so a plain `.Date` comparison against a Georgian day is correct in EF queries. The frontend reasons about the Georgian calendar day via `client/src/utils/georgianTime.ts` (`georgianToday`, `toDateKey`, `georgianDateKeyOf`).

### Realtime (SignalR)
`Persistence/Interceptors/RealtimeDashboardInterceptor.cs` is an EF `SaveChanges` interceptor that, after any commit touching orders, pushes "refetch" pings over SignalR (`API/Realtime/NotificationsHub.cs`): to all admins when the order set changes, and to a specific courier when something is assigned to/away from them. Handlers may also ping explicitly via `IRealtimeNotifier` (`NotifyAdminsOrdersChanged` / `NotifyCourierOrdersChanged`). The frontend subscribes with the `useOrdersChangedSignal` hook (`adminOrdersChanged` / `courierOrdersChanged`) to silently refetch instead of polling.

### Key domain concepts

**Order lifecycle & status flow** (`Domain/Enums/OrderStatus.cs` — one enum shared by `GroupOrder` and `Order`)
- A customer places a **GroupOrder** (batch). Its child **Order** records exist from creation and mirror the GroupOrder's status through the **pickup flow**: `Pending → AcceptedGroupOrder → CourierAssignedToPickUp → CourierOnTheWayToPickUp → CourierDeliveringToWarehouse → DeliveredToWarehouse → AdminAcceptedOrderInWareHouse`.
- At `AdminAcceptedOrderInWareHouse` each Order begins its **own last-mile flow**: `[non-Tbilisi: OrderIsOnItsWayToRecipientsCity →] CourierAssignedToDeliver → CourierDeliveringTheOrderToRecipient → DeliveredToRecipient`, with a `DeliveryPostponed` retry loop. Order pricing (`CompanyServicePrice`) is set at creation, not at warehouse acceptance.
- Standalone **Return** orders skip the batch and run their own flow: `Pending → CourierAssignedToPickUp → PickedUpFromRecipient → DeliveredReturnOrderToWarehouse → ReturnedToSender`.
- The **GroupOrder pickup courier** (`GroupOrder.CourierId`, drives `PickedUpAt`) is distinct from each Order's **last-mile delivery courier** (`Order.CourierId`); settlement attribution keys off `Order.CourierId` + the delivery timestamp.

**Order types** (`Domain/Enums/OrderType.cs`)
- `Send` — standard delivery from warehouse to recipient
- `Return` — standalone order; courier collects parcel from recipient's address and brings to warehouse; admin eventually marks `ReturnedToSender`
- `Exchange` — operationally identical to Send; tracked separately for reporting

**Order ownership**
- Send/Exchange orders belong to a customer via `Order.GroupOrderId → GroupOrder.CustomerId`
- Standalone Return orders have `GroupOrderId == null` and own the customer directly via `Order.CustomerId`
- Any query that filters by customer must OR both paths: `o.GroupOrder!.CustomerId == customerId || o.CustomerId == customerId`

**Timestamps**
- Send/Exchange completion: `Order.DeliveredAt`
- Return order completion (courier → warehouse): `Order.DeliveredToWarehouseAt`
- Queries across both types must fall back: `o.DeliveredAt ?? o.DeliveredToWarehouseAt`

**Terminal statuses** (relevant for payment/settlement logic)
- `DeliveredToRecipient`, `ExchangeCompleted` — Send/Exchange terminal
- `DeliveredReturnOrderToWarehouse`, `ReturnedToSender` — Return terminal

**Company service fee** (საკურიერო — the delivery fee the company charges)
- `Order.WhoPaysForCompanyService` (`ServicePayer`: `Sender` | `Recipient`) decides who pays it.
  - `Recipient` — courier collects it as cash at delivery (bundled into `TotalAmountOfCashCollected`).
  - `Sender` — invoiced to the customer; tracked as a receivable on `CustomerSettlement`, never in courier cash.
- `Order.CompanyServicePaymentStatus` (`Unpaid` → `Pending` → `Paid`) tracks sender-paid fee collection (only relevant when `WhoPaysForCompanyService == Sender`).

**CourierSettlement** — one record per courier per working day. Immutable once `IsTheDayClosed == true`.
- `TotalCourierTransferToCompany = TotalAmountOfCashCollected - TotalCourierSalary`
- Can be **negative** when the sender pays the company (courier collects no COD cash but earns a salary). Negative value means the company owes the courier their salary.
- Stores only immutable physical facts recorded at settlement time; stale snapshot fields were deliberately removed — derive other figures live from Orders.

**CustomerSettlement** — one record per customer per calendar month (`Year` + `Month`). Tracks two opposite money flows:
- COD the company collected for the customer's packages — *company owes customer* (`TotalCODCompanyCollectedForPackages`).
- Sender-paid service fees the customer owes the company — *customer owes company* (`TotalCompanyServicePriceOwedToCompany`).
- The four aggregate figures are auto-computed from the month's orders and refreshed on recompute. Payment fields accumulate: the plain field holds the most recent payment, the `Total*` field the running sum.

**Finance endpoints** — `CompanyFinanceController` (`/api/companyfinance/overview`, date-range admin overview), `SettlementsController` (courier settlements), `CustomerSettlementsController` (monthly customer settlements).

### Frontend structure
- `client/src/api/` — one file per domain area; each exports typed fetch functions and TypeScript interfaces that mirror backend DTOs
- `client/src/pages/` — role-segregated: `Admin/`, `Courier/`, `Customer/`, plus public pages
- `client/src/contexts/` — `AuthProvider` (JWT stored in `localStorage` as `delivery_auth`), `LanguageProvider`
- Auth token is read from `AuthContext` (`useAuth()` hook) and passed as `Authorization: Bearer <token>` header in every API call
- Roles: `Admin`, `Courier`, `Customer` — enforced both in `ProtectedRoute` (frontend) and controller `[Authorize(Roles = "...")]` attributes (backend)
- **Admin page naming is offset from its routes/views**: the **Pick-Up** page (`AdminDashboard`, `activeView === 'orders'`) drives the **GroupOrder/pickup** flow (accept batch, assign pickup courier, accept-in-warehouse, group/merge same-day batches); the **Delivery / Packages** page (`AdminOrdersPage`, `activeView === 'packages'`) drives the per-**Order** last-mile flow (assign delivery courier, set prices/salary, mark delivered). Both are single-day, navigated by a Georgian-day selector.

### Production migration policy
Migrations run automatically in development. In production they only run when `RUN_MIGRATIONS=true` environment variable is set. The startup code logs a warning if pending migrations exist but the flag is absent.

### Cache
Redis is used when `ConnectionStrings:Redis` is configured; falls back to in-memory distributed cache. Queries opt in by implementing `ICacheable` (provides `CacheKey` and `CacheDuration`).

## Conventions
- Always use `sealed` on handlers and validators
- No `var` unless type is obvious from the right side
- FluentValidation for all commands — validators are `sealed`
- Enums serialized as strings throughout (`JsonStringEnumConverter`)
- API calls in `*.ts` service files, not inline in components
- CSS variables in `theme.css`, component-scoped `.css` files
- FiraGO font (`@fontsource/firago`) — Georgian + Latin

## Do NOT
- Put logic in Domain entities
- Return entities from queries — always map to DTOs
- Add computed/snapshot columns to CourierSettlement (derive live instead)
- Rewrite entire files — make surgical targeted edits only