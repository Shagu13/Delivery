---
description: Guardrail checklist for any change touching order money — OrderFinance.cs, CustomerSettlements, CourierSettlement projections, PaymentReceipt, or the Finance Excel export. Use before and after editing anything that computes, displays, or exports order finance figures.
allowed-tools: Read, Grep, Glob, Edit
---

# Finance guardrail (Delivery)

This codebase deliberately migrated **away** from stored/snapshot finance columns (Application
roadmap phase 7 — `CourierSettlement`/`CustomerSettlement` tables were dropped). Money is now
derived live, in exactly one place, every time. Changes in this area that look like a harmless
local fix are usually a formula getting re-derived somewhere it shouldn't be.

## 1. Read first

`Application/CLAUDE.md` §4 "`Finance/OrderFinance.cs` — read this before touching money" —
this loads the current member list (`IsBillableFailedDelivery`, `SenderOwesService`,
`ServiceInflow`, `CompanyNetCash`, `CompanyRevenue`, `ExpectedCourierCash`,
`OutstandingCourierRemittance`, `CodOwedToCustomer`, `ServiceOwedBySender`, `Is*Paid`,
`HasCourierTransferedAmount`), the XML docs on `Application/Finance/OrderFinance.cs` itself for
the two conventions that collapse the 4 paid/unpaid × sender/recipient cases into one formula,
and root `CLAUDE.md` §8.

## 2. The hard rule

**Every money figure traces back to `OrderFinance` — no exceptions.** Before writing any
arithmetic on price, salary, COD, or settlement amounts:

1. Grep `Application/Finance/OrderFinance.cs` for a member that already computes it.
2. If one exists, call it. Do not copy its formula inline "just this once."
3. If none exists and the figure is genuinely new, add the member to `OrderFinance` itself (or
   one of its two live projections — `CustomerSettlementProjection` /
   `CourierSettlementProjection`), not to a handler, controller, or DTO mapper.

## 3. Never reintroduce a snapshot/computed column

Do not add a persisted column to `Order`, `GroupOrder`, `Customer`, or any other aggregate table
that stores a *computed* money value (running balance, "amount owed as of last calc", cached
revenue, etc.). That's exactly the pattern phase 7 removed. If a value needs to be queried
efficiently at scale, that's a signal to raise it with the user, not to silently add a column.

`PaymentReceipt` is the one exception — it records a discrete *event* (an admin's pay/settle
action), not a derived balance. Don't extend it to also cache derived totals.

## 4. The two live projections must never drift from each other or from `OrderFinance`

- `Application/CustomerSettlements/Queries/CustomerSettlementProjection` — per-GroupOrder /
  per-standalone-Return invoice row.
- `Application/Settlements/Queries/CourierSettlementProjection` — per-courier day summary,
  shared by the courier's own "my settlements" view and the admin "by courier" view.

If a fix changes how a figure is computed, check whether **both** projections (and any admin vs.
customer vs. courier view built on them) need the same fix — this is the same "two divergent
implementations" trap as the Packages pages, just in the finance layer.

## 5. The Finance Excel export has one deliberate omission

`API/Excel/FinanceExcelBuilder.cs` is the shared builder for both the customer and admin finance
Excel exports (see the comment at the top of the file). **Never add `CourierSalary` to it** — it
is an internal figure that must not be surfaced to exports. If a task asks to "add courier pay to
the export," stop and confirm with the user before doing it — this contradicts an existing
deliberate design decision.

## 6. Billable-failed-delivery pairing

`OrderFinance.IsBillableFailedDelivery` (backend) and `NON_BILLABLE_CANCEL_REASONS` in
`client/src/api/orders.ts` (frontend) encode the same list of cancellation reasons from two
sides. If you change which reasons are billable, update both and re-check the admin "Mark
Returned to Sender" flow for Send orders that depends on it.

## 7. Before calling a finance change done

- Confirm no new arithmetic on Order money fields exists outside `Application/Finance/` or its
  two projection files.
- Confirm no new persisted computed-money column was added to a migration.
- If the change affects a figure shown in more than one place (admin finance, customer finance,
  courier settlements, Excel export), confirm every place was checked, not just the one the user
  pointed at.
- Unit-test the handler logic if it's non-trivial — this area has the least room for silent
  drift (root `CLAUDE.md` §5 Definition of Done).
