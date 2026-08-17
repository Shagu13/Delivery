---
description: Check and fix both admin last-mile package pages when working on search, grouping, bulk-assign, bulk-deliver, export, or pricing bugs in the Admin Packages/Delivery views. Use whenever a task touches AdminPackagesPage.tsx or AdminOrdersPage.tsx, or the sidebar views "packagesTest" (ამანათები) or "packages" (Delivery).
allowed-tools: Read, Grep, Glob, Edit
---

# Packages-page dual-fix reminder (Delivery)

`client/src/pages/Admin/AdminPackagesPage.tsx` (sidebar view `packagesTest`, "ამანათები") and
`client/src/pages/Admin/AdminOrdersPage.tsx` (sidebar view `packages`, "Delivery") are **two
separate implementations of the same last-mile Order page**. Neither has been retired
(`CLAUDE.md` roadmap phase 9, "Packages page consolidation" — still open). They started as one
page and have been drifting apart ever since, so a bug reported against one almost always exists
in the other too, under a different variable/function name.

Do not fix only the file the user mentioned. Treat every bug report or feature request that
touches either page as touching both, until told otherwise.

## 1. Identify which file you were pointed at

- User says "Packages page" / ამანათები / mentions `packagesTest` → `AdminPackagesPage.tsx`
  (this is the newer, actively-developed one — see memory `packages-page-identity`).
- User says "Delivery page" / mentions `packages` (not `packagesTest`) → `AdminOrdersPage.tsx`.

If genuinely unsure which one a screenshot or description refers to, ask, or check both anyway.

## 2. Find the parallel logic in the other file

Both files independently implement the same handlers under matching (not identical) names.
Confirmed parallel anchors as of this writing — grep the name you're fixing in one file, then
grep the same name in the other:

| Concern | Likely function name in both files |
|---|---|
| Export | `handleExport` |
| Print labels | `handlePrintLabels` |
| Bulk price/apply | `handleBulkApply` |
| Bulk courier assign | `handleBulkAssign` |
| Bulk mark delivered | `handleBulkDeliver` |
| Courier salary edit | `handleSalarySave` |
| Price edit | `handlePriceSave` |
| Search / filter state | look for `filtered`, `filterCities`, `filterDistricts`, `filterParty`-style state near the top of the component |

**On the `AdminPackagesPage.tsx` side, every handler in that table now lives in
`client/src/pages/Admin/AdminPackages/usePackageSelection.ts`, not in `AdminPackagesPage.tsx`
itself** (that file was split — see `client/CLAUDE.md` §3.2). Grep the whole `AdminPackages/`
folder, not just the entry file, or you'll get a false "doesn't exist here" and miss the fix.
`AdminOrdersPage.tsx` still has all of these inline in the one file.

`AdminPackagesPage.tsx` additionally has same-day batch grouping (`groupByDate` — stays in the
entry file; `MergeModal`/`GroupingModal` — now their own files under `AdminPackages/`) that
`AdminOrdersPage.tsx` does not — don't assume every feature exists in both; confirm before
promising a symmetric fix.

## 3. Apply the same conceptual fix in both

The two implementations are not identical (different variable names, sometimes different prop
shapes), so **don't copy-paste code between them** — port the *logic* of the fix, matching each
file's existing style, then verify both against the same test case/data.

## 4. Also check these known-coupled pairs while you're in the area

From `client/CLAUDE.md` §7 "Known duplication" — if the bug touches these, fix both sides:

- Non-billable cancellation reasons: `OrderFinance.IsBillableFailedDelivery` (backend) ↔
  `NON_BILLABLE_CANCEL_REASONS` in `client/src/api/orders.ts` (frontend).
- Password policy: `PasswordRules.cs` (backend) ↔ `client/src/utils/passwordRules.ts` (frontend).

## 5. Before calling it done

- Re-grep the function/state name you changed across both page files (and, for
  `AdminPackagesPage.tsx`, its `AdminPackages/` folder) to confirm you didn't miss a third call
  site. `AdminOrdersPage.tsx` is still 2000+ lines in one file; `AdminPackagesPage.tsx` itself is
  ~1150 lines with the rest spread across `AdminPackages/`.
- State explicitly in your summary to the user which of the two files you touched and why (or
  why the second file didn't need the same change) — don't let "fixed the packages page" be
  ambiguous about which one.
