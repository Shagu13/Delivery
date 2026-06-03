# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (.NET 10)
```powershell
# Build the solution (run from repo root)
dotnet build

# Run the API (serves both API and frontend in production)
dotnet run --project API

# Add a new EF Core migration
dotnet ef migrations add <MigrationName> --project Persistence --startup-project API

# Apply pending migrations manually
dotnet ef database update --project Persistence --startup-project API
```

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
All business logic lives in `Application` as MediatR `IRequest<T>` commands/queries and their handlers. Controllers are thin — they extract the caller's identity, build the request object, call `_mediator.Send(...)`, and return the result. MediatR pipeline behaviors (in order): `LoggingBehavior` → `ValidationBehavior` → `CachingBehavior`.

### Key domain concepts

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

**DailySettlement** — one record per courier per working day.
- `TotalCourierTransferToCompany = TotalAmountOfCashCollected - TotalCourierSalary`
- Can be **negative** when the sender pays the company (courier collects no COD cash but earns a salary). Negative value means the company owes the courier their salary.

### Frontend structure
- `client/src/api/` — one file per domain area; each exports typed fetch functions and TypeScript interfaces that mirror backend DTOs
- `client/src/pages/` — role-segregated: `Admin/`, `Courier/`, `Customer/`, plus public pages
- `client/src/contexts/` — `AuthProvider` (JWT stored in `localStorage` as `delivery_auth`), `LanguageProvider`
- Auth token is read from `AuthContext` (`useAuth()` hook) and passed as `Authorization: Bearer <token>` header in every API call
- Roles: `Admin`, `Courier`, `Customer` — enforced both in `ProtectedRoute` (frontend) and controller `[Authorize(Roles = "...")]` attributes (backend)

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
- Add computed/snapshot columns to DailySettlement (derive live instead)
- Rewrite entire files — make surgical targeted edits only