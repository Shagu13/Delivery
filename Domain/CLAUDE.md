# Domain — Instructions

> Entities, enums, and the app-wide clock. The innermost layer: it references nothing
> from the solution, and everything else references it.
> Read the shared rules in [../CLAUDE.md](../CLAUDE.md) first.

---

## 1. Rules

| # | Rule | Meaning in practice |
|---|------|---------------------|
| 1 | **Data only — no logic** | Entities hold properties, defaults, and navigations. No methods, no validation, no orchestration. Business rules live in `Application`. |
| 2 | **References nothing** | The only package is `Microsoft.EntityFrameworkCore`, and only for the `[Index]` attribute on `Order`. Never add MediatR, FluentValidation, or an outer-layer reference. |
| 3 | **`CustomTime`, never `DateTime.Now`** | Every timestamp default and every caller uses `CustomTime.Now` / `.Today`. The host runs in UTC; this is what makes stored values Georgian wall-clock. |
| 4 | **Lean by design** | No value objects, no domain events, no base entity. Auditing/soft-delete are per-entity (`DateDeleted`, `CreatedAt`) rather than an interface. Keep it that way unless the user asks otherwise. |
| 5 | **Enum numbering is load-bearing** | Statuses persist as their *name*, but the numeric slots still order everything. Never renumber, never reuse a retired slot (see `OrderStatus = 4`). |

---

## 2. Contents

```
Domain/
├── CustomTime.cs               # Georgian Standard Time (UTC+4, no DST) — the app clock
├── ApplicationUser.cs          # IdentityUser + FirstName/LastName/Role
│
├── Order.cs                    # one package; the finance-bearing entity
├── GroupOrders.cs              # GroupOrder — a batch of packages from one sender
├── Customer.cs                 # sender/business account, negotiated pricing, TenantId
├── CustomerSpecialPrice.cs     # per-customer, per-district price exception (on top of Customer's capital/city/district tiers)
├── Couriers.cs                 # Courier — assigned city/district, DefaultSalary, soft-deleted
├── Warehouse.cs
├── TrackingEvent.cs            # public tracking timeline rows
│
├── City.cs / District.cs       # reference data, soft-deleted, EN + Geo names
├── WeightPriceTier.cs          # capital/city/district price per weight band
├── DeliverySchedule.cs         # 7 day-of-week bools per City; no row = not configured yet
├── LabelDesign.cs              # one user's saved label-print settings (size, custom w/h, logo position) as client-owned JSON; one row per user
│
├── Tenant.cs                   # white-label brand (host, branding, HomepageJson, co-admin)
├── TenantSettlement.cs         # monthly dilo ↔ tenant settlement (the only surviving aggregate)
├── PaymentReceipt.cs           # + PaymentReceiptAllocation — one admin pay/settle action; customer OR courier
│                               #   (Flow enum; CustomerId/CourierId nullable, exactly one set; IsService kept for customer rows)
├── PushSubscription.cs         # courier Web Push endpoint
├── PasswordResetToken.cs
├── PartnerApiKey.cs / PartnerWebhook.cs / WebhookDelivery.cs
│
└── Enums/
    ├── OrderStatus.cs          # ONE enum shared by GroupOrder and Order
    ├── OrderType.cs            # Send | Return | Exchange
    ├── PaymentStatus.cs        # product COD: NotPaid | Paid
    ├── ServicePayer.cs         # who pays the courier fee: Sender | Recipient
    ├── PaymentReceiptFlow.cs   # CodPayout | ServiceFee | CourierSalary | CourierCodTransfer
    ├── CompanyServicePaymentStatus.cs
    ├── CancellationReason.cs   # drives billable-vs-not (see Application/Finance)
    ├── PostponeReason.cs
    └── WebhookDeliveryStatus.cs
```

---

## 3. `OrderStatus` — the shared lifecycle

One enum drives both entities. The XML doc on the enum is the canonical map; the short form:

| Flow | Sequence |
|---|---|
| **Pickup** (GroupOrder, mirrored onto its Orders) | `Pending → AcceptedGroupOrder → CourierAssignedToPickUp → CourierDeliveringToWarehouse → DeliveredToWarehouse → AdminAcceptedOrderInWareHouse` |
| **Last-mile** (per Order) | `[non-Tbilisi: OrderIsOnItsWayToRecipientsCity →] CourierAssignedToDeliver → CourierDeliveringTheOrderToRecipient → DeliveredToRecipient` (+ `DeliveryPostponed` retry loop) |
| **Standalone Return** | `Pending → CourierAssignedToPickUp → PickedUpFromRecipient → DeliveredReturnOrderToWarehouse → ReturnedToSender` |
| **Exchange** | Same as Send, terminating in `ExchangeCompleted` |
| **Terminal / override** | `CancelledBySender`, `OrderNotAccepted`, `CancelledByAdmin`, `AllDelivered` |

**Slot 4 (`CourierOnTheWayToPickUp`) is retired and must stay empty.** Statuses persist as
their name via `HasConversion<string>()`, so the gap costs nothing and keeps every number
below it stable.

---

## 4. `Order` — the fields that matter

`Order` is unusually wide because the per-order finance refactor moved settlement onto it.
Groups to know:

- **Ownership** — `GroupOrderId` (Send/Exchange) **xor** `CustomerId` (standalone Return).
  Any customer-scoped query must OR both.
- **Addresses** — `Recipient*` plus optional `Latitude`/`Longitude` (set only when the sender
  picked a geocoded suggestion). `ReturnPickup*` is where the courier collects, Returns only.
- **Pricing** — `CompanyServicePrice` (the fee), `CourierSalary`, `AmountToCollectForPackage`
  (product COD), `WeightPriceTierId`, `IsCompanyServicePriceIncluded` (the entered price was all-in).
- **Per-order settlement** — `CodPaidToCustomerAmount/At`, `ServicePaidByCustomerAmount/At`,
  `CourierSalaryPaidAmount/At`, `CodTransferedToCompanyByCourier/At`, and the two
  `*SpecialCase` booleans. **Never read these raw** — go through `Application.Finance.OrderFinance`,
  which is the single source of truth for what they mean together.
- **Tenant tier** — `CodPaidToTenantAmount/At`, `ServicePaidByTenantAmount/At` are the
  *dilo ↔ tenant* settlement, a separate tier from the `*Customer` fields above. Don't mix them.
- **Timestamps** — Send/Exchange complete at `DeliveredAt`; Returns at `DeliveredToWarehouseAt`.
  Cross-type queries must use `DeliveredAt ?? DeliveredToWarehouseAt`.
- **`CancellationReason`** — not just a label. It is the signal that a failed delivery is
  *billable* (see `OrderFinance.IsBillableFailedDelivery`). Clearing it un-bills the order,
  which is why it is cleared when an order is un-cancelled back into the flow.

---

## 5. `CustomTime`

```csharp
CustomTime.Now    // Georgian Standard Time (UTC+4, no DST)
CustomTime.Today  // .Date of the above
```

Resolves `"Georgian Standard Time"` then `"Asia/Tbilisi"`, falling back to a fixed UTC+4 zone.
Because values are stored as wall-clock **without an offset**, a plain `.Date` comparison
against a Georgian calendar day is correct inside an EF query — no conversion needed.

---

## 6. Adding an entity

1. Add the class here — properties, defaults (`CustomTime.Now`), navigations. Nothing else.
2. Add a `DbSet<T>` to **both** `Application/Common/Interfaces/IAppDbContext.cs` and
   `Persistence/AppDbContext.cs`.
3. Configure it in `AppDbContext.OnModelCreating` — keys, indexes, `HasMaxLength`,
   `decimal(18,2)`, `HasConversion<string>()` for enums, delete behaviour.
4. Add a migration (stop the API first).

## 7. Do NOT

- Add methods, computed properties with logic, or validation to an entity.
- Add a project or package reference beyond EF Core.
- Use `DateTime.Now` / `DateTime.UtcNow`.
- Renumber an enum member or reuse a retired slot.
- Reintroduce a settlement aggregate with snapshot columns — finance is derived live.
