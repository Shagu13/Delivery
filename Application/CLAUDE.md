# Application — Instructions

> Every use case in the system, as a MediatR request + handler. Also owns the DTOs,
> the FluentValidation validators, the interfaces the outer layers implement, and the
> finance rules. References only `Domain`.
> Read the shared rules in [../CLAUDE.md](../CLAUDE.md) first.

---

## 1. Rules

| # | Rule | Meaning in practice |
|---|------|---------------------|
| 1 | **One handler = one use case** | If a handler grows a second responsibility, split it. |
| 2 | **`sealed` everywhere** | Handlers, validators, and shared policy classes are `sealed` (or `static`). |
| 3 | **A validator per command with a non-identifier payload** | `sealed class XCommandValidator : AbstractValidator<XCommand>`. `ValidationBehavior` runs it before the handler; failures become HTTP 422. Commands whose only inputs are route/claim identifiers don't need one — see §3.1. |
| 4 | **Never return an entity** | Every query projects to a DTO with `.Select(...)`. |
| 5 | **`AsNoTracking()` on reads** | Plus explicit `Include`/projection. No lazy loading anywhere. |
| 6 | **No DB call in a loop** | Load the set with one `Where(x => ids.Contains(x.Id))` before the loop, mutate in memory, `SaveChangesAsync` once. |
| 7 | **Extract shared rules, don't re-derive them** | A rule used by more than one handler becomes a static policy class (see §5). Re-deriving one at a call site is how the "can't add packages after courier assigned" bug happened. |
| 8 | **Depend on interfaces only** | `IAppDbContext`, `ISmsService`, `IWebPushService`, `IRealtimeNotifier`, … — never on `AppDbContext` or an Infrastructure type. |
| 9 | **No `var` unless obvious** | `var customer = await _db.Customers...` is fine; `var x = Compute()` is not. |

---

## 2. Structure — vertical slices

One folder per feature area; inside it `Commands/`, `Queries/`, `DTOs/`.
A command slice is typically three files: `XCommand.cs`, `XCommandHandler.cs`, `XCommandValidator.cs`.
Small related requests may share one file (e.g. `Orders/Commands/OrderCommands.cs`).

```
Application/
├── DependencyInjectionApplication.cs   # AddApplication(): MediatR + behaviors + validators
├── Common/
│   ├── Behaviors/      LoggingBehavior → ValidationBehavior → CachingBehavior  (this order)
│   ├── Interfaces/     IAppDbContext, ICacheService, ICacheable, IJwtTokenGenerator,
│   │                   ISmsService (+3 high-level SMS services), IWebPushService,
│   │                   IRealtimeNotifier, IPendingCountsNotifier,
│   │                   IOrderAssignmentNotifier, ITrackingNumberGenerator
│   ├── Exceptions/     NotFoundException, ConflictException, ForbiddenException, ValidationException
│   ├── Models/         PagedResult<T>
│   ├── Security/       ApiKeyHasher (SHA-256), WebhookSigner (HMAC-SHA256)
│   └── Validation/     PasswordRules  — mirrors Identity's PasswordOptions
│
├── Finance/OrderFinance.cs             # ★ single source of truth for per-order money
│
├── Auth/  Cities/  Couriers/  Customers/  CustomerStatistics/  Operators/
├── GroupOrders/                        # the batch/pickup flow — largest slice
├── Orders/                             # last-mile + return flows
├── CompanyFinance/  CustomerSettlements/  Settlements/   # finance reads (derived live)
├── PartnerApiKeys/  PartnerOrders/  PartnerWebhooks/     # external integration
├── Push/  Sms/  Tenants/  TenantSettlements/  WeightPriceTiers/
├── LabelDesigns/                       # per-user label-print settings: Get / Save (upsert), any signed-in role,
│                                       #   scoped by the JWT user id. Plural folder on purpose — `Application.LabelDesign`
│                                       #   would clash with the entity.
```

---

## 3. MediatR pipeline

Registered in `DependencyInjectionApplication.AddApplication()` in this order:

1. **`LoggingBehavior`** — outermost; logs `[START]` / `[END]` / `[FAIL]` per request.
2. **`ValidationBehavior`** — runs all `IValidator<TRequest>` in parallel, throws
   `ValidationException` with a per-property error dictionary if any fail.
3. **`CachingBehavior`** — only acts on requests implementing `ICacheable`; a hit skips
   the handler entirely. Mutating commands must call `ICacheService.RemoveAsync` to invalidate.

Add a cross-cutting concern as a new behavior — never by repeating it in handlers.

### 3.1 Validators — which commands need one

Validators auto-register via `AddValidatorsFromAssembly` in `DependencyInjectionApplication.cs`
— a `sealed class X : AbstractValidator<XCommand>` anywhere in the assembly is picked up, no
wiring. Placement follows the slice: co-located `XCommandValidator.cs`, or a shared
`FooCommandValidators.cs` when several small records live in one file (e.g.
`Orders/Commands/OrderCommandValidators.cs`, `ReturnOrderCommandValidators.cs`).

**The rule:** a command needs a validator when it carries a **non-identifier payload** — a
`decimal`/money value, free text, a collection, an enum, a `DateTime`. Assert the obvious:
amounts `>= 0` (or `> 0` for allocations), text `NotEmpty`/`MaximumLength`, enums `IsInEnum`,
collections `NotEmpty` + `RuleForEach`, "at least one of these optional fields set".

A command whose **only** inputs are `Guid`/`string` identifiers from the route or JWT claim
(`AcceptGroupOrderCommand(Guid GroupOrderId)`, `RetryDeliveryCommand(Guid OrderId, string CourierUserId)`,
every `Delete*`/`Restore*`/`SetActive` command) does **not** need one — the id already 404s in
the handler and `NotEmpty()` on it adds nothing.

Coverage as of the Tier-A backfill: every money/pricing command (`SetCourierSalary`,
`Set*CompanyServicePrice`, `PayCourierOrders`, `SetOrderCourierSettlementPayment`, the tenant
per-order payment commands, `SetCustomerCompanyPrice`), every enum-reason command
(`CancelOrderBy{Courier,Admin}`, `Postpone*`, `AdminCorrectOrderStatus`,
`AdminSetReturnOrderStatus`), the city/district text commands, the two bulk-assign commands,
and `SavePushSubscription` now have one. When adding a command, match that bar.

---

## 4. `Finance/OrderFinance.cs` — read this before touching money

The `CourierSettlement` and `CustomerSettlement` **tables no longer exist**. Finance is
derived live from payment facts stored on `Order`, and `OrderFinance` is the *only* place
that knows how those fields combine. Never re-implement a formula in a handler.

Key entry points:

| Member | Meaning |
|---|---|
| `IsBillableFailedDelivery(o)` | The delivery failed but is still charged: an explicit `CancellationReason` is present, excluding `WarehouseNotReceived` (parcel never arrived) and `DidNotWant` (cancelled before the courier reached the recipient). Returns are never billable this way. |
| `SenderOwesService(o)` | The sender owes the fee. A billable failed delivery shifts the fee to the sender even if the order was recipient-pays. |
| `ServiceInflow(o)` / `CompanyNetCash(o)` | Company cash position for the order; converges to `CompanyRevenue` once settled. |
| `CompanyRevenue(o)` | Terminal margin = `CompanyServicePrice − CourierSalary`. |
| `ExpectedCourierCash(o)` / `OutstandingCourierRemittance(o)` | What the courier collected vs. still owes the company. |
| `CodOwedToCustomer(o)` / `ServiceOwedBySender(o)` | The two opposite receivables. |
| `Is*Paid(o)` / `HasCourierTransferedAmount(o)` | Settled checks, with a 0.005 epsilon. |
| `RecipientFeePortion(o)` / `SenderServiceShare(o)` | The two halves of a fee that carries a `CustomerSurcharge` (fee 7, surcharge 1: recipient pays 6 in cash, the sender owes 1). `SenderServiceShare` is the whole fee for sender-pays orders and billable failures, only the surcharge for recipient-pays, 0 for an ordinary recipient-pays order. **Every "service owed by sender" sum uses it — never `CompanyServicePrice` — and every "cash the recipient hands over" uses `RecipientFeePortion`.** `ServiceInflow`, `ServiceOwedBySender`, `IsCompanyServicePaid`, `ExpectedCourierCash`, `DeliveredCashCollected` already do. The tenant tier (`TenantSettlementService`, `GetTenantSettlementOrdersQuery`, `RecordTenantOrderPaymentCommand`, `GetTenantFinanceOverviewQuery`) projects columns rather than loading an `Order`, so it calls `SenderServiceShareOf(payer, fee, surcharge)` — the same rule. |
| `ServicePaymentStatus(o)` | The stored `CompanyServicePaymentStatus` that matches the live figures (Paid once the sender's share is settled). Delivery handlers use it instead of hard-coding `Paid`, so a surcharge stays Unpaid. |
| `DeliveredCashCollected(o)` | Cash recorded as collected for an already-delivered order after an admin edits its fee/COD (recipient-pays: COD + fee; sender-pays: COD). Used by the edit, re-price and `SetOrderPrices` handlers. |

Two conventions make the four business cases (product Paid/Unpaid × fee paid by
Sender/Recipient) collapse to one formula — the XML docs on the class spell them out:
`CodTransferedToCompanyByCourier` is **net of any salary the courier kept**, and
`IsCompanyServicePriceIncludedSpecialCase` means the fee was netted out of the COD payout
rather than received as separate cash.

Live projections built on top of it, both `internal static`:
- `CustomerSettlements/Queries/CustomerSettlementProjection` — one invoice row per
  GroupOrder (or per standalone Return).
- `Settlements/Queries/CourierSettlementProjection` — per-courier day summaries, shared by
  the courier "my settlements" and the admin "by courier" reads so they cannot drift.

**Courier-facing fee.** `CourierOrderDto.CompanyServicePrice` is deliberately *not* the company fee on a
recipient-pays order: `CourierOrderMapping` sends only `RecipientFeePortion`, because that is all the
courier collects (the courier app adds it to the COD client-side). The admin/customer order DTOs carry the
real fee plus `CustomerSurcharge`, and their `recipientAmountDue` helpers use `recipientFeePortion`.

**Customer grid (`CustomerSettlements/Queries/GetCustomerFinanceGridQuery`).** Admin Finance → Payments grid,
`GET /api/orderfinance/customer-grid?mode=`: `Effective` (the old all-customers read, via
`OrderFinanceQueries.AllCustomersByEffectiveDate`), `Delivered` (delivered or billable-failed in the window,
`FilterByDeliveredWindow`), `ToSettle` (any date; SQL coarse prefilter, then `OrderFinance.CodOwedToCustomer` /
`ServiceOwedBySender` decide). Returns lines plus one contact row per customer (default bank account first).

### Where finance bugs actually come from

`OrderFinance` itself is clean and rarely the culprit. The recurring double-count
(`45ff5a5`, `05d27c1`, `d85eac1`, `9aaae03`) lives **outside** it:

- **The all-in price split.** When `IsCompanyServicePriceIncluded` is on, the admin/customer
  enters one all-in figure and the backend splits `product = entered − fee` **once**. The
  create/edit modals each decide independently whether the value they hold and submit is the
  all-in total or the product-only COD — and they drifted (`EditOrderModal` was re-bundling
  the fee on save while `AddPackageModal` wasn't → `120` stored as product, not `110`). Any
  change here must stay identical across `AddPackageModal.tsx`, `EditOrderModal.tsx`,
  `PackageSidebarLayout.tsx`, `CreateGroupOrderPage.tsx` — see [client/CLAUDE.md §7](../client/CLAUDE.md).
- **Reading raw `Order` money fields in a projection or export instead of calling
  `OrderFinance`.** The COD-export bug (`9aaae03`) used `AmountToCollectForPackage` directly
  and missed the recipient-paid fee; the fix was `OrderFinance.ExpectedCourierCash`. If a
  figure involves the payer × paid matrix, it goes through `OrderFinance`.

---

## 5. Shared policies — reuse, never re-derive

| Class | Rule it owns |
|---|---|
| `GroupOrders/Commands/Shared/GroupOrderAppendPolicy` | Which statuses still accept new packages (`Pending`, `AcceptedGroupOrder`, `CourierAssignedToPickUp`) — a batch closes when the courier physically collects it. |
| `GroupOrders/Commands/Shared/OpenBatchResolver` | Find-or-create today's open batch (customer web / Partner API / Return path). Use this instead of hand-rolling the lookup. |
| `GroupOrders/Commands/Shared/WalkInBatchResolver` | The walk-in equivalent, with its own "open" rule: a walk-in batch is created already at `AdminAcceptedOrderInWareHouse` (no pickup leg), so `GroupOrderAppendPolicy` doesn't apply — it just stays open for the rest of the Georgian day. Scoped to `IsWalkIn` batches only; never folds across channels into a customer's own web-originated batch. |
| `GroupOrders/Commands/Shared/GroupOrderOrderBuilder` | Builds `Order`s from DTOs and resolves the fee. `internal` — visible to the test projects via `InternalsVisibleTo`. |
| `Orders/Queries/GetAllOrders/AdminOrderListMapper` | The one `Order` → `AdminOrderListDto` mapping (+ Georgian city/district lookup), shared by the Delivery/Packages list and `Couriers/Queries/CompletedByCourier` so both feed the same admin order view modal. Add a field here, not in a handler. |
| `Couriers/Queries/CompletedByCourier` | Couriers → Completed tab reads. "Completed" on the delivery leg = delivered (`DeliveredAt`, no cancellation reason) **or** `OrderFinance.IsBillableFailedDelivery` (dated `CancelledAt ?? DeliveredAt` — the courier's attempt, not the admin's later return-to-sender stamp) **or** a standalone Return (`DeliveredToWarehouseAt`; a Send order's warehouse stamp is the pickup leg and does not count). Pickup leg = `GroupOrder.DeliveredToWarehouseAt`. |
| `Couriers/CourierSalaryEligibility` | Cities where a courier gets a `DefaultSalary` (Tbilisi, Rustavi); elsewhere the admin prices each order. |
| `Couriers/CourierDateBasis` (`CourierDateBasisPolicy`) | Which date a courier's **settlement** views group by. Regional couriers (`AssignedCity` not Tbilisi/Rustavi, i.e. `!CourierSalaryEligibility.IsEligible`) default to **Assigned** (`Order.AssignedToCourierAt` — the same day the Couriers page uses) so a batch stays together however long it takes to deliver; Tbilisi/Rustavi stay on **Delivered**. Resolved in one place (`DefaultFor` / `ForCourierAsync`) and read by: `GetCouriersWithDeliveriesOnDateQuery` (picker), `GetCourierOrderFinanceLinesQuery` (`Basis` override; admin only), `CourierSettlementProjection.BuildAsync` (day cards, no override), `GET /api/couriers` (`defaultDateBasis`). Assigned-date lists also contain open orders (undelivered/postponed) — their money is payable/counted only once `OrderFinance.IsCourierLegComplete`. A new settlement read that groups couriers' orders by day must go through this policy. The unused `GetSettlementPreviewQuery` is still delivery-dated. |
| `Orders/Commands/ChangeOrderPayer/OrderPayerChangePolicy` | Admin History → Edit on a **delivered Send** order: flips `WhoPaysForCompanyService` and cascades every dependent field (fee, cash collected, service-paid / netting flag, COD payout, tenant payment, courier remittance + salary-kept flag), trimming `PaymentReceipt`s via `Settlements/PaymentReceiptTrimmer`. `ChangeOrderPayerCommand` and `GetOrderPayerChangePreviewQuery` both call `Apply`, so the preview can never differ from the save. Fee suggestion = `OrderServiceFeeResolver`, which reuses `GroupOrderOrderBuilder.ResolveZones/ResolveCalculatedFee`. Change finance rules in `OrderFinance`, not here. |
| `Orders/Commands/SetCourierSalaryBulk` | Couriers page → Edit salary (Admin only): one salary on many orders, all-or-nothing (refused if it exceeds any order's service fee). One load, `CourierSalaryReceiptReconciler.CapPaidAmount` per order in memory, one `PaymentReceiptTrimmer.TrimManyAsync`, one save. The single-order `SetCourierSalaryCommand` keeps its own path. |
| `Orders/Commands/CustomerOrderActionPolicy` | What a customer may still edit/cancel themselves. |
| `Orders/Commands/ReturnAssignmentPolicy` | Courier assignment rules for Return orders. |
| `Tenants/TenantHost` | Host normalization (lowercase, strip port and `www.`). |

### Fee resolution order (in `GroupOrderOrderBuilder`)

explicit override → weight-tier zone price → customer's per-district special price →
customer negotiated tier (capital/city/district) → district default → unset (null, admin fills later).

**Step 1 (explicit override) is not always trusted.** `BuildAsync` takes an
`allowClientPriceOverride` flag. `AdminCreateWalkInOrderCommandHandler` (admin/operator) leaves
it at its default `true` — a staff-entered price is legitimate. `CreateGroupOrderCommandHandler`
(customer web **and** Partner API — both callers), `CheckoutCartCommandHandler`, and
`AddOrdersToGroupOrderCommandHandler` (all customer-only endpoints) pass `false`, so step 1 is
skipped and the fee always falls through to steps 2–4. This exists because those DTOs carry a
client-computed `CompanyServicePrice` for instant preview (see the client-side reimplementation
note below) — without the flag, a tampered request could set an arbitrary company fee.

**Pickup-swap pricing:** the *default* price swaps to the batch's pickup district when the
pickup is **not** the capital **and** the delivery **is** the capital (e.g. Rustavi → Tbilisi
prices at Rustavi's rate). Non-capital → non-capital prices off the delivery district as usual.
The swap moves only the default price — a **customer's negotiated rates (tier and special
price alike) always follow the delivery zone**. Standalone Returns already price off their own
pickup district, so the swap never touches them.

**Per-district special price (`CustomerSpecialPrice`):** a sparse, customer-specific
exception on top of the capital/city/district tiers — e.g. "this customer gets a special rate
for Rustavi specifically" without changing their city-tier rate for every other non-capital
city. Managed by admins via `PUT/DELETE /api/customers/{id}/special-prices`
(`Customers/SpecialPrices/{Commands,Queries}`). Both `GroupOrderOrderBuilder` and
`CalculatorController` (the pre-submit price preview) check it, and — because
`GroupOrderOrderBuilder`'s resolved price is threaded straight through as the DTO's
`CompanyServicePrice` explicit-override field — so does every client-side reimplementation of
this waterfall (see [client/CLAUDE.md §7](client/CLAUDE.md#7-known-duplication--check-both)).

**District lookup is by (city, district name), never name alone.** District names repeat across
cities (e.g. three "Central"s), and orders store only the name strings. `GroupOrderOrderBuilder.FindDistrict`
prefers the row in the order's city (`RecipientCity` / `ReturnPickupCity` / the batch's `PickUpCity`);
a name-only match is just the fallback. A name-only lookup priced a Tbilisi order as a village.
`CalculatorController` is unaffected — it takes district IDs.

### "Terminal status" sets — the un-DRYest thing in the codebase

There is **no single constant** for "this order/batch is finished". The set is re-encoded
~6 times on the backend and ~7 on the client, and they demonstrably drift (`e3aa6b1` shipped
because one copy had 2 of the 4 statuses). Backend copies that must agree:

| Location | Purpose |
|---|---|
| `Orders/Commands/OrderCommandHandlers.cs` → `GroupOrderReopener` | which closed batches `AdminCorrectOrderStatus` (un-cancel) must reopen: `AllDelivered`, `CancelledByAdmin`, `CancelledBySender`, `OrderNotAccepted` |
| `GroupOrders/Queries/GetAllGroupOrders/GetAllGroupOrdersQueryHandler.cs` → `TerminalGroupOrderStatuses` / `TerminalOrderStatuses` | whether a batch/order shows on the Packages page at all |
| `GroupOrders/Commands/AcceptGroupOrder{,InWarehouse}/…Handler.cs` → `IsTerminal` | reject accept on a dead batch |
| `GroupOrders/Commands/Shared/GroupOrderAppendPolicy.Appendable` | the **inverse** gate — which statuses still accept new packages |

Any new terminal status, or a new way a batch can close (a new `Decline*`/`Cancel*` command),
must be added to **all** of them, plus the client copies in
[client/CLAUDE.md §7](client/CLAUDE.md#7-known-duplication--check-both). The reversal paths
(`AdminCorrectOrderStatusCommand`, `GroupOrderReopener`) also must never assume `CourierId` is
set — a plain admin cancel is allowed before an order reaches a delivery courier, so land it
at `AdminAcceptedOrderInWareHouse`, not `CourierAssignedToDeliver`.

---

## 6. Adding a use case

1. Create the slice folder under the feature area.
2. `public sealed record XCommand(...) : IRequest<TResult>;`
3. `public sealed class XCommandHandler : IRequestHandler<XCommand, TResult>` — inject
   `IAppDbContext` and any needed interface, nothing concrete.
4. `public sealed class XCommandValidator : AbstractValidator<XCommand>` if it has a
   non-identifier payload (§3.1).
5. Project to a DTO in `DTOs/`. For a paged read return `PagedResult<T>`.
6. For a cacheable read, implement `ICacheable` and have mutations invalidate the key.
7. Add the thin controller action in `API/Controllers/`.

## 7. Do NOT

- Put a DB query or `SaveChangesAsync` inside a loop.
- Return a `Domain` entity from a query.
- Re-implement a finance formula outside `OrderFinance`, or a shared rule outside its policy class.
- Add a terminal `OrderStatus` (or a new batch-closing command) without updating every
  "terminal status" copy listed in §5 — backend *and* client.
- Reference `AppDbContext`, `Persistence`, or `Infrastructure` directly.
- Filter a customer's orders by only one ownership path — always OR `GroupOrder.CustomerId`
  and `Order.CustomerId`.
- Trust a tenant id from the request body — it comes from the JWT claim.
