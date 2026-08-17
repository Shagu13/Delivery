---
description: Guide for actually retiring one of the two duplicate admin last-mile pages (AdminPackagesPage.tsx / AdminOrdersPage.tsx) as opposed to just fixing a bug in both. Use when the user asks to merge, consolidate, unify, or retire the Packages/Delivery admin pages — not for routine bug fixes (see the packages-page-dual-fix skill for those).
allowed-tools: Read, Grep, Glob, Edit, Bash
---

# Packages page consolidation (Delivery)

Root `CLAUDE.md` roadmap, phase 9, "in flight": `AdminPackagesPage.tsx` (sidebar view
`packages`, ამანათები) and `AdminOrdersPage.tsx` (sidebar view `delivery`, "Delivery") are
two implementations of the same last-mile Order page. The stated end state is that **one gets
retired**. This skill is for doing that retirement itself — not for the day-to-day bug fixes
covered by the `packages-page-dual-fix` skill, which stays relevant right up until this happens.

This is high blast-radius work: it deletes a route real admins/operators use daily, deletes a
component, and touches role-gating. **Confirm the plan with the user before deleting anything** —
don't treat "consolidate the pages" as license to silently drop a page mid-task.

## 1. Read first

- `client/CLAUDE.md` §5 ("Admin page naming is offset from its routes") and §7 ("Known
  duplication").
- The `packages-page-dual-fix` skill — its table of confirmed parallel function names
  (`handleExport`, `handlePrintLabels`, `handleBulkApply`, `handleBulkAssign`,
  `handleBulkDeliver`, `handleSalarySave`, `handlePriceSave`) is the feature-parity checklist
  for step 3 below.
- `client/src/pages/Admin/AdminDashboard.tsx` — both views are wired here (see `new-admin-view`
  skill for how a view is registered).

## 2. Confirm the direction with the user, don't assume it

As of the current docs, `packages` (`AdminPackagesPage.tsx`) is described as the *newer*
last-mile page and is the only one with same-day batch grouping (`groupByDate` in the entry file;
`MergeModal`/`GroupingModal` under its `AdminPackages/` folder — see `client/CLAUDE.md` §3.2).
That's a signal it's the intended survivor, not a guarantee — re-verify by
diffing the two files' current feature sets (grep the function-name table from
`packages-page-dual-fix`) before committing to a direction, and state the direction back to the
user explicitly before deleting the losing page.

## 3. Feature-parity audit before touching anything

For every function in the losing page's file, confirm the surviving page already has equivalent
behavior — or port it over — before removing the losing page. Pay attention to:

- Prop differences passed from `AdminDashboard.tsx` (`canManage`, `canAssignCourier`,
  `canGroup`, `canSeeRevenue` — these differ by role: Admin/Operator/Tenant).
- Any query-param-driven initial state (`initialSearch`, `initialParty`, `key={...}` remount
  triggers) — the surviving page must handle the same deep-link shapes.
- CSS classes: confirm the surviving page's co-located `.css` actually ships every class either
  page relied on (see `client/CLAUDE.md` §6 "Shared UI CSS must be co-located").

Do not delete the losing page until this audit is complete and any gaps are ported.

## 4. Find every reference to the losing view before removing it

Grep the losing view's string key (`'delivery'` or `'packages'`) and its sidebar/topbar
translation keys (`t.navDelivery` / `t.topbarPackages`) across `client/src/`. As of
this writing both view keys are only referenced inside `AdminDashboard.tsx` itself — no other
page deep-links into one specifically — but re-verify at consolidation time, since new code may
have added links (e.g. from `AdminHistoryPage`, `AdminOrderSearchPage`, or a push-notification
click target) since this skill was written.

## 5. Remove the losing view from `AdminDashboard.tsx`

Mirror every addition point from the `new-admin-view` skill, in reverse, for the losing view:

1. Remove it from the `AdminView` union type.
2. Remove it from `ADMIN_VIEWS`, `OPERATOR_VIEWS`, and `TENANT_VIEWS`.
3. Remove its sidebar `button`.
4. Remove its topbar title line.
5. Remove its content render line.
6. If any `activeView === '<losingView>'` guard remains elsewhere in the file (redirect logic,
   `requestedView` fallback), remove or repoint it to the survivor.

## 6. Delete the file and its dead imports

Delete `client/src/pages/Admin/<LosingPage>.tsx` and its co-located `.css` only after step 5's
edits leave zero references (`Grep` the component name across `client/src/`). Remove its now-dead
import from `AdminDashboard.tsx`. **If `AdminPackagesPage.tsx` is the losing page**, also delete
its `client/src/pages/Admin/AdminPackages/` folder (its hook + extracted subcomponents — see
`client/CLAUDE.md` §3.2) — confirm nothing in it is imported from outside that folder first
(it shouldn't be; it was never part of the planned `features/` layer, see §3.1/§3.2).

## 7. Clean up translations

Only remove `t.*` keys that were exclusive to the losing page — check each candidate key isn't
also used by the surviving page or elsewhere before deleting it from both `ka` and `en` blocks in
`translations.ts`. When in doubt, leave the key (an unused translation key is harmless; a
deleted-but-still-referenced one breaks the build).

## 8. Update the docs that describe the duplication as current

Once retirement is actually complete (not before):

- Root `CLAUDE.md` §6 phase 9 — mark consolidation done, or remove the roadmap line.
- `client/CLAUDE.md` §7 "Known duplication" — remove the `AdminPackagesPage`/`AdminOrdersPage`
  bullet.
- `client/CLAUDE.md` §5's "Admin page naming is offset from its routes" table — drop the row for
  the retired page.
- Flag to the user that the `packages-page-dual-fix` skill is now stale and should be deleted or
  rewritten — it exists specifically to remind future work to check both pages, which no longer
  applies once there's only one.

## 9. Verify

- Don't run the frontend build/type-check/lint to "verify" — the user builds themselves
  (root `CLAUDE.md`).
- Walk through the role matrix once more (Admin / Operator / Tenant) confirming each still lands
  on the surviving page with the right permissions, since this was previously split across two
  components with independently-drifted prop logic.
