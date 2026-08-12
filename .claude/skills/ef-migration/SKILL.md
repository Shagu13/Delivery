---
description: Create and apply an EF Core migration in this repo (Persistence project, SQL Server). Use when a Domain entity or DbContext model change needs a migration, or the user says "add a migration", "migrate the database", "update the schema".
allowed-tools: Bash, Read, Grep, Glob
---

# EF Core migration workflow (Delivery)

Follow these steps in order. Do not skip the pre-flight check — it's the #1 way this fails.

## 1. Pre-flight: make sure nothing has `API/bin` locked

`dotnet ef` builds the startup project (`API`), and building writes to `API/bin`. If the API
is running locally (`dotnet run --project API`), the DLLs are locked and the migration command
fails with `MSB3026 "file in use"`.

- Ask the user to stop the running API, or check yourself:
  `Get-Process dotnet -ErrorAction SilentlyContinue` and confirm none are serving the API.
- Only proceed once you're sure `API/bin` is free.

## 2. Confirm the model change is already made

The migration is generated from the current `AppDbContext` model + entity classes, not written
by hand. Before generating anything, make sure the actual change (new entity, new property, new
relationship, `HasConversion`, `[Index]`, etc.) is already saved in `Domain/` and/or
`Persistence/AppDbContext.cs` (or its `Configurations/`).

Check `Domain/CLAUDE.md` and `Persistence/CLAUDE.md` for entity/EF conventions before making the
change — in particular:
- Enums are persisted as strings (`HasConversion<string>()`, `varchar`), not as ints.
- Domain entities are data only — no logic to migrate.
- Do **not** reintroduce snapshot/computed finance columns on an aggregate table (finance is
  derived live via `Application/Finance/OrderFinance.cs` — see root `CLAUDE.md` §8).

## 3. Generate the migration

Pick a short PascalCase name describing the change (e.g. `AddDeliverySchedule`,
`EnumColumnsToVarchar` — see `Persistence/Migrations/` for existing examples).

```powershell
dotnet ef migrations add <MigrationName> --project Persistence --startup-project API
```

This creates three files under `Persistence/Migrations/`:
`<timestamp>_<MigrationName>.cs`, `<timestamp>_<MigrationName>.Designer.cs`, and updates
`AppDbContextModelSnapshot.cs`.

## 4. Review the generated migration before applying it

Read the new `<timestamp>_<MigrationName>.cs` file. Check:
- `Up()` only contains the change you intended — EF sometimes picks up unrelated drift if the
  snapshot was stale. If you see unexpected column changes, stop and investigate before applying.
- Any new non-nullable column added to a table with existing rows has a `defaultValue` /
  `defaultValueSql`, or the migration will fail on `database update` against real data.
- `Down()` looks like a sane reverse of `Up()` (EF generates this automatically, but skim it).

## 5. Apply it

```powershell
dotnet ef database update --project Persistence --startup-project API
```

## 6. Verify the build

Do **not** build at the solution root (`Delivery.slnx` registers `client/` as a Website project
and fails with `MSB4249`). Build the library project directly:

```powershell
dotnet build Persistence/Persistence.csproj
```

## 7. Commit

Commit the three new/updated migration files together with the entity/DbContext change that
caused them, directly to `master` (no feature branches — see root `CLAUDE.md` §7).
