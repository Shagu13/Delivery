---
description: Add a new sidebar view/page to the Admin dashboard in this repo (React 19 + TS client). Use when the user asks to add a new admin page, admin tab, or admin sidebar item.
allowed-tools: Read, Edit, Grep, Glob
---

# New Admin sidebar view (Delivery)

`AdminDashboard.tsx` is **not** a router with per-view routes — it's a single component that
switches on an `activeView` string. There is no per-view lazy loading; a new view is a new
branch of a big union type. Follow every step below; missing one leaves a view that's reachable
but unstyled, untranslated, or open to the wrong role.

## 1. Read first

- `client/CLAUDE.md` §5 (Roles & routing) and §6 (Styling) — role/view model and CSS co-location
  rule.
- `client/src/pages/Admin/AdminDashboard.tsx` — every step below edits this one file.

## 2. Add the view to the type + role arrays

In `AdminDashboard.tsx`:

```ts
type AdminView = 'overview' | 'orders' | 'packages' | ... | '<newView>';
```

Then add `'<newView>'` to whichever of these three `readonly AdminView[]` arrays should see it:

- `ADMIN_VIEWS` — full Admin role
- `OPERATOR_VIEWS` — Operator role (narrower — no finance/tenant/system views)
- `TENANT_VIEWS` — white-label co-admin (narrowest — currently `orders`, `packages`,
  `packagesTest`, `customers`, `finance`, `homepage`)

A view only reachable by Admin goes in `ADMIN_VIEWS` alone. Decide deliberately — don't add to
all three by default.

## 3. Add a sidebar button

Copy the pattern of an existing `sidebar__link` button (e.g. the `schedule` one around line 335):

```tsx
<button className={`sidebar__link ${activeView === '<newView>' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('<newView>')} title={t.<newSidebarKey>}>
  ...
</button>
```

Gate it the same way neighboring buttons are gated if it's role-restricted (e.g. `isSystemAdmin &&`).

## 4. Add the topbar title line

```tsx
{activeView === '<newView>' && t.<newTopbarKey>}
```

## 5. Add the content render line

```tsx
{activeView === '<newView>' && <YourNewPageComponent token={token ?? ''} ... />}
```

Pass `canManage`/`canSeeRevenue`/etc. props the same way sibling views do if the page needs to
behave differently for Operator/Tenant.

## 6. Build the page component itself

Create `client/src/pages/Admin/AdminYourNewPage.tsx` (+ co-located `.css` — see step 8) following
`client/CLAUDE.md` §9 Definition of Done:

- Data fetching through TanStack Query, reading from a typed function in `client/src/api/*.ts`
  (never `fetch` inline). Add the API file if one doesn't exist for this resource.
- Loading / empty / error states handled explicitly.
- Reuse `components/ui/` (FormField, Modal, ConfirmDialog, CityDistrictPicker, etc.) rather than
  re-implementing them.
- Mobile-first: works at ~360px, touch targets ≥ ~40px, inputs `font-size: 16px`.
- Under ~150 lines / one responsibility — split out a hook or subcomponent if it grows.

## 7. Translations

Add every new key to **both** `ka` and `en` blocks in `client/src/contexts/translations.ts` —
follow the existing naming convention (`sidebar*`, `nav*`, `topbar*`). No hardcoded user-visible
strings anywhere in the new component.

## 8. CSS

There is no global component stylesheet — co-locate the new `.css` file with the new component
and import it there, or shared classes (`.modal-overlay`, `.btn-ghost`, `.form-field__*`, …)
silently won't ship and the view renders unstyled/off-page. See client/CLAUDE.md §6.

## 9. Backend authorization must match

The UI role gate (`ADMIN_VIEWS`/`OPERATOR_VIEWS`/`TENANT_VIEWS`) is not itself a security
boundary — the corresponding controller endpoint(s) in `API/Controllers/` need the matching
`[Authorize(Roles = "...")]` (or `SystemAdmin` policy) attribute. Check `API/CLAUDE.md` for the
exact role matrix and keep both in step.

## 10. Verify

- Don't run the frontend build/type-check/lint to "verify" — the user builds themselves
  (root `CLAUDE.md`).
- Walk the checklist above once more against the diff before calling it done; a missed
  translation key or missing role array entry is the most common gap.
