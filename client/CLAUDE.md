# client — Frontend Instructions

> React 19 + TypeScript SPA on Vite. Four role-segregated portals plus a public site,
> installable as a PWA (the courier app is the main mobile target), bilingual ka/en.
> Read the shared rules in [../CLAUDE.md](../CLAUDE.md) first.

---

## 1. Rules

| # | Rule | Meaning in practice |
|---|------|---------------------|
| 1 | **Function components + hooks only** | No class components. React 19, with the React Compiler babel plugin enabled. |
| 2 | **Mobile-first** | Couriers work from a phone and customers place orders from one. Every page must work at ~360px. Native inputs need `font-size: 16px` on touch or iOS Safari zooms the page on focus. |
| 3 | **Separation of concerns** | UI in components, fetching in `api/` + TanStack Query, rules in `utils/`. Never `fetch` inline in a component. |
| 4 | **Type safety** | No `any` without a comment justifying it. Interfaces in `api/*.ts` mirror the backend DTOs. |
| 5 | **DRY** | Shared UI → `components/ui/`, shared logic → `hooks/` or `utils/`. Search before adding — this codebase has already been bitten (§7). |
| 6 | **All copy through i18n** | `const { t } = useLanguage()` → `t.someKey`. Both `ka` and `en` in `contexts/translations.ts`. No hardcoded user-visible strings. |
| 7 | **One source of truth per resource** | One query key per resource; mutations invalidate it. Don't mirror server data into `useState`. |
| 8 | **Component size** | Past ~150 lines or a second responsibility, split it. |
| 9 | **Georgian calendar day** | Date logic goes through `utils/georgianTime.ts` (`georgianToday`, `toDateKey`, `georgianDateKeyOf`) — never raw `new Date()` day maths. |

---

## 2. Commands

```powershell
npm install
npm run dev       # http://localhost:3100 — proxies /api and /hubs (ws) to https://localhost:7100
npm run build     # tsc -b && vite build  →  outputs to ../API/wwwroot
npm run lint
```

> **Do not run build / type-check / lint to verify a change** — the user builds themselves.
> The deploy workflow runs `npm ci && npm run build` itself, so a frontend commit does not need rebuilt `API/wwwroot` assets.

---

## 3. Structure

```
client/src/
├── main.tsx  App.tsx  queryClient.ts  pwa-auto-update.ts
├── api/                  # one file per domain area: typed fetch fns + DTO interfaces (23 files)
├── contexts/             # Auth, Language, Branding, Cart — each split Context.ts / Provider.tsx / useX.ts
│   └── translations.ts   # ~4200 lines, en + ka
├── components/
│   ├── ProtectedRoute.tsx
│   ├── layout/           # AppLayout, PublicNav, StaffNav, layout.css
│   └── ui/               # FormField, CityDistrictPicker, GeorgianPhoneField, Modal,
│                         #   ConfirmDialog, DateRangeNav, LocationMultiPicker,
│                         #   MultiCityDistrictFilter, PasswordRequirements, …
├── pages/
│   ├── Home/ Faq/ Contact/ Login/ Register/ ForgotPassword/ ResetPassword/   # public
│   ├── CreateGroupOrder/  Cart/                                              # customer order flow
│   ├── Admin/            # ~41 files — 21 sidebar views. AdminDashboard.tsx is ~3,600 lines
│   │                     #   (day selectors, batch grouping, courier bar) — a candidate for the
│   │                     #   same page-local split AdminPackages/ got (§3.2); don't grow it further.
│   │   ├── CompletedCouriers/  # Couriers → "Completed Orders" tab (3rd toggle beside Delivery/Pickup):
│   │   │                       #   filters (leg · courier · day/range), grouped lists, Excel export — see §3.4
│   │   └── AdminPackages/  #   AdminPackagesPage.tsx (packages)'s own hook + extracted
│   │                       #   subcomponents (usePackageSelection, BulkFieldModal, PackageRow,
│   │                       #   pickup-side modals) — see §3.2
│   ├── Courier/          # dashboard + components/ (swipe actions, maps, geo-sort, sound);
│   │                     #   Scan tab (CourierScanPage: scan-to-claim warehouse parcels) and
│   │                     #   components/ScanDeliveryFlow (scan-to-deliver popup) use ui/CameraScanner
│   ├── Customer/
│   └── Tenant/           # white-label co-admin + public tenant homepage
├── realtime/             # SignalR connection, useOrdersChangedSignal, useAdminPendingCounts, pushNotifications
├── hooks/  services/  types/  utils/
└── styles/theme.css      # ALL design tokens
```

Routes are **lazy-loaded** in `App.tsx` so a customer never downloads admin code. Provider
order: `PersistQueryClientProvider → LanguageProvider → BrandingProvider → AuthProvider →
CartProvider → BrowserRouter → AppLayout`.

### 3.1 Planned direction: a `features/` layer (not started yet)

Loosely adopting the Bulletproof React / Feature-Sliced Design convention — **not** the full
FSD layer stack (`app/pages/widgets/features/entities/shared` with strict one-way imports and
mandatory `index.ts` barrels everywhere). That's too much ceremony for this team's size. The
one piece worth taking:

- **`features/<use-case>/`** — a self-contained module per user-facing use-case (not a page,
  not a domain entity): `api.ts`, `useX.ts` hook(s), the UI, `index.ts`. Candidates: order
  assignment, order search/filter, order export, customer settle — the exact logic that
  currently gets reimplemented separately inside `AdminPackagesPage.tsx` and
  `AdminOrdersPage.tsx` (§7) instead of owned in one place both pages import.
- **Import direction:** `pages → features → shared` (`api/`, `hooks/`, `utils/`,
  `components/ui/`). Never `feature → feature` — if two features need the same thing, that
  thing belongs in `utils/`, `hooks/`, or `components/ui/`, not a cross-feature import.
- **Migrate incrementally, only when touching that code.** Do not mass-move existing page logic
  into `features/` in one pass — that's a rewrite, which root rule §1.9 forbids. The next time
  a bug turns out to be shared by both last-mile pages, extract that piece into `features/`
  instead of patching both copies separately; let the folder earn its contents over time.
- Everything else stays as-is — `api/`, `contexts/`, `components/ui/`, `hooks/`, `utils/`,
  `types/`, `services/` already match Bulletproof React's `lib/` / `stores/` / `components/` /
  `hooks/` / `utils/` / `types/` layers, so there is nothing to rename or move there.

### 3.2 `AdminPackages/` — a page-local split, not the `features/` layer

`AdminPackagesPage.tsx` (`packages`) was split into a colocated `AdminPackages/` folder
(constants/helpers, badges, `PackageRow`/`PackageTableHead`, a unified `BulkFieldModal`, the
pickup-side modals, and a `usePackageSelection` hook owning the bulk-selection state machine) —
modeled on `Courier/`'s existing page-root-plus-`components/` pattern (§3), scaled to this page's
outlier size (was 2073 lines; the entry file is now ~1150). `usePackageSelection` is a deliberate,
noted exception to the "state stays inline in the component" house style, justified by size alone.

**Data flow:** the visible list is always server-paged (`mainQuery`, `PAGE_SIZE` rows). The
same-day merge helpers (`mergeableByCustomer`, `batchesFor`, `multiBatchCustomers`,
`ungroupedCustomers`) read a *separate* `windowScopedQuery` that is scoped to the single
effective day, not the whole active set — it used to fetch 500 rows (every active batch) and
discard all but one day client-side, which made each load hydrate ~340 batches to show 30.
`AdminOrdersPage.tsx` already pages server-side and has no such window.

This is **not** the §3.1 `features/` layer — nothing in `AdminPackages/` is imported by
`AdminOrdersPage.tsx` or any other page; it's private to `AdminPackagesPage.tsx`. If a piece of it
(e.g. the salary/price bulk-fill modal, or the assign/deliver gating logic) turns out to be needed
by `AdminOrdersPage.tsx` too, *that's* the moment to promote it into `features/` per §3.1 — don't
treat its current location as already-shared.

### 3.2a Courier settlement date basis

Finance → Courier Settlements (`CourierSettlementsSection` → `SettlementModal`) groups a courier's orders by
**delivery day** or **assignment day**. The server supplies each courier's default (`Courier.defaultDateBasis`,
regional couriers → `'Assigned'`; rule lives in `Application/Couriers/CourierDateBasis.cs`, never re-derived
here) and the modal has a toggle that overrides it via `fetchCourierOrderFinanceAdmin(..., basis)`. Assigned-date
lists include open orders, so payability/totals gate on `isCourierLegComplete` (`utils/orderFinanceOutstanding.ts`,
mirror of `OrderFinance.IsCourierLegComplete`). The courier's own screen (`CourierSettlementsPage`) follows its
default automatically (no toggle) — label via `fetchCourierDateBasis`; day cards carry `dateBasis` /
`totalOrdersAssigned`.

The settlement modal's date row has two quick buttons: **Today** (the day view, default) and **All Unpaid**
(`fetchCourierOrderFinanceAdmin(..., unsettled = true)` → `GetCourierOrderFinanceLinesQuery.OnlyUnsettled`): every order
of the courier, of any date, with salary or cash still open (`OrderFinance.IsCourierUnsettled`, SQL-prefiltered by
`OrderFinanceQueries.CourierUnsettledCandidates` — keep the two in step). It ignores date and basis, so those controls are
dimmed/hidden, and the table gains a Delivered column. The pay bars and Settle net work unchanged on that list.

**Every modal is border-resizable.** `components/ui/AutoResizeDialogs` is mounted once in `AppLayout`; it watches the DOM
for `[role="dialog"][aria-modal="true"]` and gives each centred, non-full-screen one two drag strips on its left/right
border (double-click resets; hidden below 720px wide). It sets an inline `width`/`max-width` on the dialog element, so a
new modal needs **no wiring** as long as the box itself carries `role="dialog" aria-modal="true"` (an overlay wrapper
that carries the role instead is skipped — it covers the viewport). Options as attributes on the dialog: `data-no-resize`,
`data-resize-min="640"`, `data-resize-key="k"` (remember the width per browser; `SettlementModal` uses it). The same
component adds an **expand / collapse button beside the dialog's X** (full screen and back): it locates the close button by
class / accessible name / "✕" text in the dialog's top-right area, so a modal with no X (small confirm boxes) gets no expand
button, and a new modal's close button should keep a `close`-ish class or aria-label to be found. `data-no-resize` turns off
both. Expanding sets inline `width/height: 100vw/100dvh` and restores the previous inline values on collapse. The global
`fieldset { min-width: 0 }` rule in `index.css` stops a fieldset holding a wide table from growing past its modal.

### 3.2b Finance → Payments customer grid

`CustomerInvoicesSection` (`AdminFinancePage.tsx`) shows `CustomerFinanceGrid mode="picker"` until a customer is
picked. A `gridMode` toggle (`All` / `Delivered` / `To settle`) feeds `fetchCustomerFinanceGrid`; `To settle`
ignores dates, so the date controls hide and `pickCustomer` clears the window. Picker-only columns: contact,
phone, delivered, COD, default bank (+ "more" → `CustomerBankAccountsModal`). The Overview-tab `mode="expand"`
grid is unchanged.

### 3.3 Resumable localStorage drafts — `useWalkInDrafts`

`hooks/useWalkInDrafts.ts` is a fourth precedent for the per-user localStorage pattern
(`contexts/CartProvider.tsx`'s per-customer scoping, `contexts/AuthProvider.tsx`'s single-object
key, `pages/Courier/components/useGeoSort.ts`'s geocode cache) — no shared `useLocalStorage`
abstraction exists, each one hand-rolls read/write with a try/catch guard. It backs the admin
"+ Add Package" walk-in modal (`pages/Admin/AddPackageModal.tsx`): every close path (backdrop
click, header ✕, Cancel) saves an in-progress form as a draft instead of discarding it, keyed
per staff username (`delivery_walkin_drafts_<username>`), expiring after 24h. Because
`useWalkInDrafts` and `AddPackageModal` need each other's types (`WalkInDraft` embeds the
modal's `CustForm`/`PkgRow`), the modal exports those two interfaces and the hook imports them
as `import type` only — this keeps the cross-reference to a type-level one, so there is no
runtime circular-import edge between the two files. `components/layout/WalkInDraftsMenu.tsx`
(mounted from `StaffNav.tsx` for Admin/Operator) is the basket icon that lists/resumes/discards
these drafts from anywhere in the portal, using a custom `window` event to stay in sync with the
modal within one tab (localStorage's own `storage` event doesn't fire in the tab that wrote it).
Reuse this pattern for the next "don't lose an in-progress form" need rather than inventing
another one-off.

### 3.4 Couriers → Completed Orders (`pages/Admin/CompletedCouriers/`)

The Couriers view's pill now has three toggles — Delivery · Pickup · **Completed Orders**. While Completed is
on, `AdminCouriers` (in `AdminDashboard.tsx`) pauses its assigned-orders fetch (`showCompleted`) and renders
`CompletedCouriersPanel` instead. The panel has its own Delivery/Pickup toggle, a courier select (default *All*),
and a single-day **or** date-range picker (max 93 days — mirrors `CompletedRange.MaxDays` on the backend).

- **Delivery leg** lists delivered orders, **billable failed** deliveries (red badge + cancellation reason) and
  standalone **Returns** brought to the warehouse. Rows open `ViewOrderModal`. Salary shows per row/courier; the
  Excel export deliberately omits it.
- **Pickup leg** lists batches (GroupOrders) by `DeliveredToWarehouseAt`.
- Data: `api/couriers.ts` (`fetchCompletedDeliveries/Pickups`, `exportCompletedExcel`). Backend:
  `Application/Couriers/Queries/CompletedByCourier`. `CompletedDelivery<TOrder>` is generic so `api/` never imports
  from `pages/`.
- Styles live in `completed-couriers.css` next to the components (`.ccp-*`); the grouped rows still lean on
  `go-*` / `status-badge*` classes, which `AdminDashboard` ships.

---

## 4. Data fetching

- **TanStack Query for every read.** Defaults in `queryClient.ts`: `staleTime` 30s,
  `gcTime` 30min, `refetchOnWindowFocus: false`, `retry: 1` — "instant from cache, quietly
  revalidate". Refresh is driven by SignalR, not by focus.
- **Cache persists to IndexedDB** via `PersistQueryClientProvider`, so a hard refresh repaints
  instantly instead of showing spinners. Bump `QUERY_CACHE_BUSTER` when a DTO shape changes in
  a way old persisted JSON can't satisfy.
  **Do not modify this wiring unless explicitly asked** (`queryClient.ts`, the provider in
  `App.tsx`, the idb-keyval storage).
- **Auth:** token from `useAuth()`, passed as `Authorization: Bearer <token>` by each `api/*.ts`
  function. `AuthProvider` stores the user in `localStorage` under `delivery_auth` and, on
  sign-out, clears both the in-memory and persisted caches (shared machines).
- **Realtime:** subscribe with `useOrdersChangedSignal(token, 'adminOrdersChanged' |
  'courierOrdersChanged', refetch)`. The ping carries no payload — refetch through the normal
  query. `useAdminPendingCounts` drives the nav badges.

---

## 5. Roles & routing

| Route | Guard | Notes |
|---|---|---|
| `/`, `/faq`, `/login`, `/register`, `/contact`, `/forgot-password`, `/reset-password` | public | `HomeRoute` swaps in a tenant homepage by host |
| `/send`, `/cart` | `Customer` | order creation → cart → checkout |
| `/admin/*` | `Admin`, `Operator`, `TenantAdmin` | one `AdminDashboard`, three view subsets |
| `/courier/*` | `Courier` | the PWA target |
| `/customer/*` | `Customer` | |
| `/tenant/*` | `TenantAdmin` | minimal dashboard; the co-admin's real workspace is `/admin` |

`AdminDashboard` gates its sidebar by role: `ADMIN_VIEWS` (21) / `OPERATOR_VIEWS` (12) /
`TENANT_VIEWS` (6), and `systemadmin` additionally unlocks `tenants`, `partners`,
`tenantSettlements`. **Guarding in the UI is not enough** — the backend attribute is the real
boundary; keep them in step.

### Admin page naming is offset from its routes

| Sidebar | `activeView` | File | Drives |
|---|---|---|---|
| Pick-Up | `orders` | `AdminDashboard` | the **GroupOrder** pickup flow — accept batch, assign pickup courier, accept-in-warehouse, group/merge same-day batches |
| Delivery | `delivery` | `AdminOrdersPage` | the per-**Order** last-mile flow (older page) |
| ამანათები (Packages) | `packages` | `AdminPackagesPage` | the *newer*, actively-developed last-mile page |

Both last-mile pages are single-day, navigated by a Georgian-day selector. `packages` used to be
`AdminOrdersPage`'s key and `packagesTest` was `AdminPackagesPage`'s — swapped so the actively
maintained page owns the plain `packages` URL (`?view=packages`) now that it's no longer a test
page. Query-key namespaces (`['admin', 'packages'/'delivery', ...]`) were renamed to match on
each page. Old `?view=packagesTest` links fall through to the `overview` default rather than 404.

---

## 6. Styling

- **All tokens in `styles/theme.css`** (`--color-accent: #F6AA02`, radii, shadows,
  `--transition`, `--staff-nav-h: 64px`). Use the variables; don't hardcode hex.
- Component-scoped `.css` next to the component. `dashboard.css` holds shared admin layout.
- **FiraGO** (`@fontsource/firago`) is the body font — it covers Georgian *and* Latin. Syne is
  display-only, Latin-only, so Georgian headings fall back to FiraGO.
- Sticky elements that must clear the navbar use `top: var(--staff-nav-h, 0px)`.

### ⚠ Shared UI CSS must be co-located

There is **no global component stylesheet**. Classes like `.modal-overlay`, `.btn-ghost`,
`.form-field__*`, `.package-card__fragile-toggle` only exist where someone put them. If you use
a class from another component, verify its CSS actually ships with the component you're in —
otherwise modals and fields render unstyled and off-page. When adding shared UI, co-locate the
CSS with the component and import it there.

---

## 7. Known duplication — check both

- **`AdminPackagesPage.tsx` (`packages`) and `AdminOrdersPage.tsx` (`delivery`)** are two
  implementations of the last-mile page with drifting duplicate logic. A search, grouping, or
  assign bug usually exists in both. Fix both until one is retired. When the shared logic behind
  such a bug is substantial, consider extracting it into `features/` (§3.1) instead of patching
  both copies again. `AdminPackagesPage.tsx`'s own logic is split across `AdminPackages/` (§3.2)
  — grep that folder too, not just the entry file, when hunting for the parallel of something
  you found in `AdminOrdersPage.tsx`.
- Backend and frontend both encode the non-billable cancellation reasons
  (`OrderFinance.IsBillableFailedDelivery` ↔ `NON_BILLABLE_CANCEL_REASONS` in `api/orders.ts`)
  and the password policy (`PasswordRules.cs` ↔ `utils/passwordRules.ts`). Change together.
- The company-service-fee waterfall (explicit override → weight-tier zone price → customer's
  per-district special price → customer negotiated capital/city/district tier → district
  default) is authoritative in `GroupOrderOrderBuilder`/`CalculatorController`, but is also
  **reimplemented client-side three times** because the create-order pages need an instant
  preview without a round trip per keystroke: `PackageSidebarLayout.tsx`'s `computeFee`
  (customer create-order flow), `CreateGroupOrderPage.tsx`'s inline duplicate of the same
  thing (Excel-import path), and `EditOrderModal.tsx`'s `resolveServicePrice` (admin
  add/edit-package auto-fill, shared by `AdminPackagesPage.tsx` and `AdminOrdersPage.tsx`).
  A pricing-waterfall change — like the special-price step above — must touch all four.
  **The computed value is still submitted as the order's `CompanyServicePrice` field, but it
  is only authoritative when it reaches an admin/staff-only endpoint.** For the two
  customer-facing reimplementations (`PackageSidebarLayout.tsx`, `CreateGroupOrderPage.tsx`)
  it is a preview only — `GroupOrderOrderBuilder` re-derives the fee server-side for every
  customer/Partner-API order and ignores the submitted number (see
  [Application/CLAUDE.md §5](../Application/CLAUDE.md#5-shared-policies--reuse-never-re-derive)).
  `EditOrderModal.tsx` feeds admin-only commands, where the submitted price is still trusted.
- **"Terminal status" sets are re-encoded ~7 times on the client** with no shared constant,
  and mirror a backend set that also has no constant (see
  [Application/CLAUDE.md §5](../Application/CLAUDE.md)). Named copies: `utils/groupOrderUtils.ts`
  (`TERMINAL_GO_STATUSES`, `TERMINAL_ORDER_STATUSES`), `AdminOrderSearchPage.tsx`
  (`TERMINAL_STATUSES`), `AdminReturnExchangePage.tsx` (`TERMINAL_STATUSES`,
  `RETURN_TERMINAL_STATUSES`). Inline string-literal arrays: `AdminOrdersPage.tsx` (~L1857,
  twice on adjacent lines), `AdminGroupOrderActions.tsx`, `AdminHistoryPage.tsx`,
  `CustomerDashboard.tsx`. A new terminal `OrderStatus` has to be added to all of them.
- **Local-midnight day math that should use `utils/georgianTime.ts`.** `AdminDashboard.tsx`
  (~L1670) and `AdminPackagesPage.tsx` (~L473) do `new Date(); d.setHours(0,0,0,0)` instead of
  `georgianToday()`/`toDateKey()`. Low severity — users are all UTC+4 no-DST, so browser-local
  == Georgian time in practice — but wrong for a mis-configured or travelling client near
  midnight. Route through `georgianTime.ts` when you next touch those lines (rule §1.9).
- **Recipient-phone autofill dropdown** is implemented twice, independently: `AddPackageModal.tsx`
  (`PackageCard`, admin "+ Add Package") and `PackageSidebarLayout.tsx` (`PackageDetail`, customer
  create-order flow) each own their own debounced search, suggestion-list markup, and CSS
  (`.ap-suggest*` vs `.psl-suggest*`), calling different endpoints
  (`searchRecipientSuggestions` scoped to the admin's locked-in customer vs
  `searchMyRecipientSuggestions` scoped to the caller's own JWT `customerId`) that both hit
  `Application/Orders/Queries/SearchRecipientSuggestions`. A UX or behavior change to one
  (debounce timing, minimum characters, empty-state copy) should be checked against the other.
  Only the customer side re-resolves the fee on pick (`PackageSidebarLayout.tsx` has
  `districtLookup` available for a free `District` lookup; `AddPackageModal.tsx` does not, so
  picking a suggestion there leaves the price field for the admin to reconfirm).

---

## 8. PWA & push

`vite-plugin-pwa` with `registerType: 'autoUpdate'`, `skipWaiting` + `clientsClaim`;
`pwa-auto-update.ts` reloads the page once a new worker takes over. `/api` and `/hubs` are on
the `navigateFallbackDenylist` so API and SignalR traffic is never served from cache.
`public/push-sw.js` is layered onto the generated Workbox worker via `workbox.importScripts`,
adding the `push` and `notificationclick` handlers.

Courier Web Push (VAPID) is set up in `realtime/pushNotifications.ts`.
**iOS delivers push only to an installed PWA** — the courier must add the app to their home screen.

---

## 9. Definition of Done (per screen)

- Works at phone width; touch targets ≥ ~40px; inputs 16px so iOS doesn't zoom.
- Loading / empty / error states handled; early returns rather than deep nesting.
- Every string via `t.*`, present in both `ka` and `en`.
- Reads through TanStack Query with a stable key; mutations invalidate it.
- API call lives in `api/*.ts`.
- Reuses `components/ui/` rather than re-implementing a field, modal, or picker.
- Role guard matches the backend attribute.
- Any new CSS class is defined in a stylesheet that actually ships with the component.

## 10. Do NOT

- `fetch` inline in a component.
- Hardcode user-visible copy.
- Touch the persisted query-cache setup unless asked.
- Add a design token as a literal instead of a `theme.css` variable.
- Append the selected city to a Geoapify address-autocomplete query — narrowing it that way
  makes results *worse*; the plain query performs better.
- Assume a fix to one last-mile page covers the other.
