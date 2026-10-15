using Application.Common.Interfaces;
using Domain;
using Domain.Enums;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Persistence;

public class AppDbContext : IdentityDbContext<ApplicationUser>, IAppDbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Courier>          Couriers          => Set<Courier>();
    public DbSet<Customer>         Customers         => Set<Customer>();
    public DbSet<CustomerSpecialPrice> CustomerSpecialPrices => Set<CustomerSpecialPrice>();
    public DbSet<CustomerSecondaryAddress> CustomerSecondaryAddresses => Set<CustomerSecondaryAddress>();
    public DbSet<CustomerBankAccount> CustomerBankAccounts => Set<CustomerBankAccount>();
    public DbSet<CompanyBankAccount>  CompanyBankAccounts  => Set<CompanyBankAccount>();
    public DbSet<LabelDesign>         LabelDesigns         => Set<LabelDesign>();
    public DbSet<Tenant>           Tenants           => Set<Tenant>();
    public DbSet<TenantSettlement> TenantSettlements => Set<TenantSettlement>();
    public DbSet<Warehouse>        Warehouses        => Set<Warehouse>();
    public DbSet<GroupOrder>       GroupOrders       => Set<GroupOrder>();
    public DbSet<Order>            Orders            => Set<Order>();
    public DbSet<TrackingEvent>    TrackingEvents    => Set<TrackingEvent>();
    public DbSet<City>             Cities            => Set<City>();
    public DbSet<District>         Districts         => Set<District>();
    public DbSet<WeightPriceTier>  WeightPriceTiers  => Set<WeightPriceTier>();
    public DbSet<DeliverySchedule> DeliverySchedules => Set<DeliverySchedule>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<PartnerApiKey>    PartnerApiKeys    => Set<PartnerApiKey>();
    public DbSet<PartnerWebhook>   PartnerWebhooks   => Set<PartnerWebhook>();
    public DbSet<WebhookDelivery>  WebhookDeliveries => Set<WebhookDelivery>();
    public DbSet<PushSubscription> PushSubscriptions => Set<PushSubscription>();
    public DbSet<PaymentReceipt>           PaymentReceipts           => Set<PaymentReceipt>();
    public DbSet<PaymentReceiptAllocation> PaymentReceiptAllocations => Set<PaymentReceiptAllocation>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.HasSequence<long>("TrackingNumberSeq", "dbo")
            .StartsAt(1).IncrementsBy(1);

        // ── PushSubscription ─────────────────────────────────────────────────
        modelBuilder.Entity<PushSubscription>(e =>
        {
            e.HasKey(p => p.Id);
            e.Property(p => p.Endpoint).IsRequired().HasMaxLength(1000);
            e.Property(p => p.P256dh).IsRequired().HasMaxLength(400);
            e.Property(p => p.Auth).IsRequired().HasMaxLength(200);
            e.HasIndex(p => p.Endpoint).IsUnique();
            e.HasIndex(p => p.CourierId);
            e.HasOne(p => p.Courier).WithMany().HasForeignKey(p => p.CourierId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── Courier ──────────────────────────────────────────────────────────
        modelBuilder.Entity<Courier>(e =>
        {
            e.HasKey(c => c.Id);
            e.HasIndex(c => c.IdNumber).IsUnique();
            e.HasIndex(c => c.PhoneNumber).IsUnique();
            e.HasIndex(c => new { c.AssignedCity, c.AssignedDistrict });
            e.HasOne(c => c.ApplicationUser).WithOne()
             .HasForeignKey<Courier>(c => c.ApplicationUserId)
             .OnDelete(DeleteBehavior.Restrict);
            e.Property(c => c.FirstName).HasMaxLength(100).IsRequired();
            e.Property(c => c.LastName).HasMaxLength(100).IsRequired();
            e.Property(c => c.IdNumber).HasMaxLength(50).IsRequired();
            e.Property(c => c.PhoneNumber).HasMaxLength(20).IsRequired();
            e.Property(c => c.AssignedCity).HasMaxLength(100).IsRequired();
            e.Property(c => c.AssignedDistrict).HasMaxLength(100).IsRequired();
            e.Property(c => c.DefaultSalary).HasColumnType("decimal(18,2)");
        });

        // ── Customer ─────────────────────────────────────────────────────────
        modelBuilder.Entity<Customer>(e =>
        {
            e.HasKey(c => c.Id);
            // Phone is no longer unique — one owner may run several businesses on the same
            // number. Email (via Identity) and business name are the unique account keys.
            e.HasIndex(c => c.PhoneNumber);
            // Looked up together with PhoneNumber when an admin registers a walk-in
            // customer / links a later account (Add Package flow).
            e.HasIndex(c => c.IdNumber);
            e.HasIndex(c => c.BusinessName).IsUnique();
            e.HasIndex(c => c.City);
            e.HasIndex(c => c.CreatedAt);
            // Admin search (standalone-order path) — StartsWith needs an index per searched
            // field (see Order above).
            e.HasIndex(c => c.FirstName);
            e.HasIndex(c => c.LastName);
            e.HasIndex(c => c.District);
            e.HasIndex(c => c.Address);
            e.HasOne(c => c.ApplicationUser).WithOne()
             .HasForeignKey<Customer>(c => c.ApplicationUserId)
             .OnDelete(DeleteBehavior.Restrict);
            e.HasMany<GroupOrder>()
             .WithOne(g => g.Customer)
             .HasForeignKey(g => g.CustomerId)
             .OnDelete(DeleteBehavior.SetNull);
            // White-label tenant: null = root brand (dilo.ge). On tenant delete the
            // customers survive and fall back to root (SetNull).
            e.HasIndex(c => c.TenantId);
            e.HasOne(c => c.Tenant).WithMany(t => t.Customers)
             .HasForeignKey(c => c.TenantId).OnDelete(DeleteBehavior.SetNull);
            e.Property(c => c.FirstName).HasMaxLength(100).IsRequired();
            e.Property(c => c.LastName).HasMaxLength(100).IsRequired();
            e.Property(c => c.IdNumber).HasMaxLength(50);
            e.Property(c => c.BusinessName).HasMaxLength(150).IsRequired();
            e.Property(c => c.PhoneNumber).HasMaxLength(20).IsRequired();
            e.Property(c => c.City).HasMaxLength(100).IsRequired();
            e.Property(c => c.District).HasMaxLength(100).IsRequired();
            e.Property(c => c.Address).HasMaxLength(250).IsRequired();
            e.Property(c => c.CompanyServiceCapitalPrice).HasColumnType("decimal(18,2)");
            e.Property(c => c.CompanyServiceCityPrice).HasColumnType("decimal(18,2)");
            e.Property(c => c.CompanyServiceDistrictPrice).HasColumnType("decimal(18,2)");
        });

        // ── CustomerSpecialPrice (per-district negotiated price exceptions) ────
        modelBuilder.Entity<CustomerSpecialPrice>(e =>
        {
            e.HasKey(s => s.Id);
            // One row per customer per district — SetCustomerSpecialPriceCommand upserts on it.
            e.HasIndex(s => new { s.CustomerId, s.DistrictId }).IsUnique();
            e.HasOne(s => s.Customer).WithMany(c => c.SpecialPrices)
             .HasForeignKey(s => s.CustomerId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(s => s.District).WithMany()
             .HasForeignKey(s => s.DistrictId).OnDelete(DeleteBehavior.Cascade);
            e.Property(s => s.Price).HasColumnType("decimal(18,2)");
        });

        // ── CustomerSecondaryAddress (extra saved pickup addresses, capped at 5 in the
        //    AddCustomerSecondaryAddressCommand handler — not a DB constraint) ─────
        modelBuilder.Entity<CustomerSecondaryAddress>(e =>
        {
            e.HasKey(a => a.Id);
            e.HasIndex(a => a.CustomerId);
            e.HasOne(a => a.Customer).WithMany(c => c.SecondaryAddresses)
             .HasForeignKey(a => a.CustomerId).OnDelete(DeleteBehavior.Cascade);
            e.Property(a => a.Label).HasMaxLength(60).IsRequired();
            e.Property(a => a.City).HasMaxLength(100).IsRequired();
            e.Property(a => a.District).HasMaxLength(100).IsRequired();
            e.Property(a => a.Address).HasMaxLength(250).IsRequired();
        });

        // ── CustomerBankAccount (saved payout accounts, capped at 5 in the
        //    AddCustomerBankAccountCommand handler — not a DB constraint) ──────
        modelBuilder.Entity<CustomerBankAccount>(e =>
        {
            e.HasKey(a => a.Id);
            e.HasIndex(a => a.CustomerId);
            e.HasOne(a => a.Customer).WithMany(c => c.BankAccounts)
             .HasForeignKey(a => a.CustomerId).OnDelete(DeleteBehavior.Cascade);
            e.Property(a => a.Label).HasMaxLength(60);
            e.Property(a => a.BankName).HasMaxLength(100).IsRequired();
            e.Property(a => a.AccountHolderName).HasMaxLength(150).IsRequired();
            e.Property(a => a.AccountNumber).HasMaxLength(50).IsRequired();
        });

        // ── CompanyBankAccount (the company's own payout accounts, admin-managed) ──
        modelBuilder.Entity<CompanyBankAccount>(e =>
        {
            e.HasKey(a => a.Id);
            e.Property(a => a.Label).HasMaxLength(60);
            e.Property(a => a.BankName).HasMaxLength(100).IsRequired();
            e.Property(a => a.AccountHolderName).HasMaxLength(150).IsRequired();
            e.Property(a => a.AccountNumber).HasMaxLength(50).IsRequired();
        });

        // ── LabelDesign (one user's saved parcel-label print settings; one row per user) ──
        modelBuilder.Entity<LabelDesign>(e =>
        {
            e.HasKey(d => d.Id);
            e.Property(d => d.OwnerUserId).HasMaxLength(450).IsRequired();   // matches Identity's key length
            e.Property(d => d.PrefsJson).IsRequired();
            e.HasIndex(d => d.OwnerUserId).IsUnique();
        });

        // ── Tenant (white-label brand) ────────────────────────────────────────
        modelBuilder.Entity<Tenant>(e =>
        {
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.Host).IsUnique();
            e.HasIndex(t => t.AdminApplicationUserId);
            // The co-admin account; Restrict so a tenant with an assigned admin can't
            // be orphaned by deleting the user out from under it.
            e.HasOne(t => t.AdminApplicationUser).WithOne()
             .HasForeignKey<Tenant>(t => t.AdminApplicationUserId)
             .OnDelete(DeleteBehavior.Restrict);
            e.Property(t => t.Host).HasMaxLength(150).IsRequired();
            e.Property(t => t.DisplayName).HasMaxLength(150).IsRequired();
            e.Property(t => t.LogoUrl).HasMaxLength(500);
            e.Property(t => t.PrimaryColor).HasMaxLength(20);
        });

        // ── TenantSettlement (monthly tenant ↔ company settlement) ─────────────
        modelBuilder.Entity<TenantSettlement>(e =>
        {
            e.HasKey(s => s.Id);
            e.HasIndex(s => s.TenantId);
            // One settlement per tenant per calendar month.
            e.HasIndex(s => new { s.TenantId, s.Year, s.Month }).IsUnique();
            e.HasOne(s => s.Tenant).WithMany()
             .HasForeignKey(s => s.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.Property(s => s.TotalCODCompanyCollectedForTenant).HasColumnType("decimal(18,2)");
            e.Property(s => s.TotalCompanyServicePriceOwedByTenant).HasColumnType("decimal(18,2)");
            e.Property(s => s.TotalAmountOfCollectedCodPaidToTenant).HasColumnType("decimal(18,2)");
            e.Property(s => s.AmountOfCollectedCodPaidToTenant).HasColumnType("decimal(18,2)");
            e.Property(s => s.TotalAmountPaidToCompanyForCompanyService).HasColumnType("decimal(18,2)");
            e.Property(s => s.AmountPaidToCompanyForCompanyService).HasColumnType("decimal(18,2)");
        });

        // ── PaymentReceipt ───────────────────────────────────────────────────
        modelBuilder.Entity<PaymentReceipt>(e =>
        {
            e.HasKey(p => p.Id);
            e.HasIndex(p => p.CustomerId);
            e.HasIndex(p => p.CourierId);
            e.HasIndex(p => p.PaidAt);
            e.HasOne(p => p.Customer).WithMany()
             .HasForeignKey(p => p.CustomerId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(p => p.Courier).WithMany()
             .HasForeignKey(p => p.CourierId).OnDelete(DeleteBehavior.Restrict);
            e.Property(p => p.Flow).HasConversion<string>().HasMaxLength(30).IsUnicode(false);
            e.Property(p => p.TotalAmount).HasColumnType("decimal(18,2)");
            e.HasMany(p => p.Allocations).WithOne(a => a.PaymentReceipt)
             .HasForeignKey(a => a.PaymentReceiptId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<PaymentReceiptAllocation>(e =>
        {
            e.HasKey(a => a.Id);
            e.HasIndex(a => a.OrderId);
            e.HasOne(a => a.Order).WithMany()
             .HasForeignKey(a => a.OrderId).OnDelete(DeleteBehavior.Restrict);
            e.Property(a => a.Amount).HasColumnType("decimal(18,2)");
        });

        // ── Warehouse ────────────────────────────────────────────────────────
        modelBuilder.Entity<Warehouse>(e =>
        {
            e.HasKey(w => w.Id);
            e.HasIndex(w => w.City);
            e.Property(w => w.Name).HasMaxLength(150).IsRequired();
            e.Property(w => w.City).HasMaxLength(100).IsRequired();
            e.Property(w => w.Address).HasMaxLength(250).IsRequired();
        });

        // ── GroupOrder ───────────────────────────────────────────────────────
        modelBuilder.Entity<GroupOrder>(e =>
        {
            e.HasKey(g => g.Id);
            // Soft delete — a stamped batch is hidden from every read in the system.
            // No restore path; the row survives only for finance/audit integrity.
            e.HasQueryFilter(g => g.DateDeleted == null);
            e.HasIndex(g => g.Status);
            e.HasIndex(g => g.CreatedAt);
            // Filtered index for the day-navigated / finance / history reads, which all
            // now carry the implicit "DateDeleted IS NULL" from the query filter above.
            e.HasIndex(g => g.CreatedAt)
             .HasDatabaseName("IX_GroupOrders_CreatedAt_Active")
             .HasFilter("[DateDeleted] IS NULL");
            e.HasIndex(g => g.CustomerId);
            e.HasIndex(g => new { g.PickUpCity, g.PickUpDistrict });
            // Admin search — StartsWith needs an index per searched field (see Order above).
            // PickUpCity is already the leading column of the composite index above.
            e.HasIndex(g => g.SenderFirstName);
            e.HasIndex(g => g.SenderLastName);
            e.HasIndex(g => g.SenderBusinessName);
            e.HasIndex(g => g.SenderPhone);
            e.HasIndex(g => g.AlternativeSenderPhone);
            e.HasIndex(g => g.PickUpDistrict);
            e.HasIndex(g => g.PickUpAddress);
            e.HasOne(g => g.Courier).WithMany(c => c.GroupOrders)
             .HasForeignKey(g => g.CourierId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(g => g.Warehouse).WithMany()
             .HasForeignKey(g => g.WarehouseId).OnDelete(DeleteBehavior.SetNull);
            e.HasMany(g => g.Orders).WithOne(o => o.GroupOrder)
             .HasForeignKey(o => o.GroupOrderId).IsRequired(false).OnDelete(DeleteBehavior.SetNull);
            e.Property(g => g.SenderFirstName).HasMaxLength(100).IsRequired();
            e.Property(g => g.SenderLastName).HasMaxLength(100).IsRequired();
            e.Property(g => g.SenderIdNumber).HasMaxLength(50);
            e.Property(g => g.SenderBusinessName).HasMaxLength(150).IsRequired();
            e.Property(g => g.SenderPhone).HasMaxLength(20).IsRequired();
            e.Property(g => g.AlternativeSenderPhone).HasMaxLength(20);
            e.Property(g => g.PickUpCity).HasMaxLength(100).IsRequired();
            e.Property(g => g.PickUpDistrict).HasMaxLength(100).IsRequired();
            e.Property(g => g.PickUpAddress).HasMaxLength(250).IsRequired();
            e.Property(g => g.Note).HasMaxLength(500);
            e.Property(g => g.Status).HasConversion<string>().HasMaxLength(50).IsUnicode(false);
        });

        // ── Order ─────────────────────────────────────────────────────────────
        modelBuilder.Entity<Order>(e =>
        {
            e.HasKey(o => o.Id);
            // Soft delete — a stamped order is hidden from every read in the system
            // (admin, courier, customer, finance, history, public tracking, Partner API).
            // No restore path; the row survives only for finance/audit integrity.
            e.HasQueryFilter(o => o.DateDeleted == null);
            e.HasIndex(o => o.Status);
            e.HasIndex(o => o.CreatedAt);
            // Filtered index for the day-navigated / finance / history reads, which all
            // now carry the implicit "DateDeleted IS NULL" from the query filter above.
            e.HasIndex(o => o.CreatedAt)
             .HasDatabaseName("IX_Orders_CreatedAt_Active")
             .HasFilter("[DateDeleted] IS NULL");
            e.HasIndex(o => o.OrderType);
            e.HasIndex(o => new { o.RecipientCity, o.RecipientDistrict });
            e.HasIndex(o => o.GroupOrderId);
            e.HasIndex(o => o.CompanyServicePaymentStatus);
            e.HasIndex(o => o.HasCompanyPaidTheSender);
            // Admin search (Packages/Delivery pages) matches these as StartsWith — sargable
            // only with an index per field. RecipientCity is already the leading column of
            // the composite index above.
            e.HasIndex(o => o.RecipientName);
            e.HasIndex(o => o.RecipientPhone);
            e.HasIndex(o => o.RecipientAddress);
            e.HasIndex(o => o.RecipientDistrict);
            e.HasOne(o => o.Customer).WithMany()
             .HasForeignKey(o => o.CustomerId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(o => o.Courier).WithMany(c => c.Orders)
             .HasForeignKey(o => o.CourierId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(o => o.Warehouse).WithMany()
             .HasForeignKey(o => o.WarehouseId).OnDelete(DeleteBehavior.SetNull);
            e.HasMany(o => o.TrackingEvents).WithOne()
             .HasForeignKey(t => t.OrderId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(o => o.WeightPriceTier).WithMany()
             .HasForeignKey(o => o.WeightPriceTierId).OnDelete(DeleteBehavior.SetNull);
            e.Property(o => o.RecipientName).HasMaxLength(201).IsRequired();
            e.Property(o => o.RecipientPhone).HasMaxLength(20).IsRequired();
            e.Property(o => o.RecipientCity).HasMaxLength(100).IsRequired();
            e.Property(o => o.RecipientDistrict).HasMaxLength(100).IsRequired();
            e.Property(o => o.RecipientAddress).HasMaxLength(250).IsRequired();
            e.Property(o => o.TrackingNumber).HasMaxLength(30).IsRequired();
            e.HasIndex(o => o.ExternalReference);
            e.Property(o => o.ExternalReference).HasMaxLength(100);
            e.Property(o => o.Description).HasMaxLength(500);
            e.Property(o => o.Status).HasConversion<string>().HasMaxLength(50).IsUnicode(false);
            e.Property(o => o.OrderType).HasConversion<string>().HasMaxLength(20).IsUnicode(false);
            e.Property(o => o.ProductPaymentStatus).HasConversion<string>().HasMaxLength(20).IsUnicode(false);
            e.Property(o => o.WhoPaysForCompanyService).HasConversion<string>().HasMaxLength(20).IsUnicode(false);
            e.Property(o => o.CompanyServicePaymentStatus).HasConversion<string>().HasMaxLength(20).IsUnicode(false);
            e.Property(o => o.ReturnPickupAddress).HasMaxLength(250);
            e.Property(o => o.ReturnPickupCity).HasMaxLength(100);
            e.Property(o => o.ReturnPickupDistrict).HasMaxLength(100);
            e.Property(o => o.CourierSalary).HasColumnType("decimal(18,2)");
            e.Property(o => o.CompanyServicePrice).HasColumnType("decimal(18,2)");
            e.Property(o => o.CompanyRevenue).HasColumnType("decimal(18,2)");
            e.Property(o => o.AmountOfCashCollected).HasColumnType("decimal(18,2)");
            e.Property(o => o.AmountToCollectForPackage).HasColumnType("decimal(18,2)");
            e.Property(o => o.CodPaidToCustomerAmount).HasColumnType("decimal(18,2)");
            e.Property(o => o.ServicePaidByCustomerAmount).HasColumnType("decimal(18,2)");
            e.Property(o => o.CodPaidToTenantAmount).HasColumnType("decimal(18,2)");
            e.Property(o => o.ServicePaidByTenantAmount).HasColumnType("decimal(18,2)");
            e.Property(o => o.CodTransferedToCompanyByCourier).HasColumnType("decimal(18,2)");
            e.Property(o => o.CourierSalaryPaidAmount).HasColumnType("decimal(18,2)");

        });

        // ── TrackingEvent ─────────────────────────────────────────────────────
        modelBuilder.Entity<TrackingEvent>(e =>
        {
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.OrderId);
            e.HasIndex(t => t.CreatedAt);
            e.Property(t => t.Status).HasMaxLength(100).IsRequired();
            e.Property(t => t.Description).HasMaxLength(500).IsRequired();
        });

        // ── City ──────────────────────────────────────────────────────────────
        modelBuilder.Entity<City>(e =>
        {
            e.HasKey(c => c.Id);
            e.HasIndex(c => c.CityName).IsUnique();
            e.HasIndex(c => c.DateDeleted);
            e.Property(c => c.CityName).HasMaxLength(100).IsRequired();
            e.HasMany(c => c.Districts)
             .WithOne(d => d.City)
             .HasForeignKey(d => d.CityId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        // ── District ─────────────────────────────────────────────────────────
        modelBuilder.Entity<District>(e =>
        {
            e.HasKey(d => d.Id);
            e.HasIndex(d => new { d.CityId, d.DistrictName }).IsUnique();
            e.HasIndex(d => d.DateDeleted);
            e.Property(d => d.DistrictName).HasMaxLength(100).IsRequired();
            e.Property(d => d.CompanyServicePrice).HasColumnType("decimal(18,2)");
        });

        // ── DeliverySchedule ─────────────────────────────────────────────────
        modelBuilder.Entity<DeliverySchedule>(e =>
        {
            e.HasKey(s => s.Id);
            e.HasIndex(s => s.CityId).IsUnique();
            e.HasIndex(s => s.DateDeleted);
            e.HasOne<City>()
             .WithOne()
             .HasForeignKey<DeliverySchedule>(s => s.CityId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        // ── WeightPriceTier ───────────────────────────────────────────────────
        modelBuilder.Entity<WeightPriceTier>(e =>
        {
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.DateDeleted);
            e.HasIndex(t => new { t.MinWeightKg, t.MaxWeightKg });
            e.Property(t => t.Label).HasMaxLength(100);
            e.Property(t => t.MinWeightKg).HasColumnType("decimal(18,3)");
            e.Property(t => t.MaxWeightKg).HasColumnType("decimal(18,3)");
            e.Property(t => t.CapitalPrice).HasColumnType("decimal(18,2)");
            e.Property(t => t.CityPrice).HasColumnType("decimal(18,2)");
            e.Property(t => t.DistrictPrice).HasColumnType("decimal(18,2)");
        });

        // ── PartnerApiKey ─────────────────────────────────────────────────────
        modelBuilder.Entity<PartnerApiKey>(e =>
        {
            e.HasKey(k => k.Id);
            e.HasIndex(k => k.KeyHash).IsUnique();
            e.HasIndex(k => k.CustomerId);
            e.HasOne(k => k.Customer).WithMany()
             .HasForeignKey(k => k.CustomerId).OnDelete(DeleteBehavior.Cascade);
            e.Property(k => k.Name).HasMaxLength(150).IsRequired();
            e.Property(k => k.KeyHash).HasMaxLength(128).IsRequired();
            e.Property(k => k.KeyPrefix).HasMaxLength(20).IsRequired();
        });

        // ── PartnerWebhook ────────────────────────────────────────────────────
        modelBuilder.Entity<PartnerWebhook>(e =>
        {
            e.HasKey(w => w.Id);
            e.HasIndex(w => w.CustomerId);
            e.HasOne(w => w.Customer).WithMany()
             .HasForeignKey(w => w.CustomerId).OnDelete(DeleteBehavior.Cascade);
            e.Property(w => w.Url).HasMaxLength(500).IsRequired();
            e.Property(w => w.Secret).HasMaxLength(200).IsRequired();
        });

        // ── WebhookDelivery (outbox) ──────────────────────────────────────────
        modelBuilder.Entity<WebhookDelivery>(e =>
        {
            e.HasKey(d => d.Id);
            e.HasIndex(d => new { d.Status, d.NextAttemptAt });
            e.HasIndex(d => d.WebhookId);
            e.HasIndex(d => d.CustomerId);
            e.HasOne(d => d.Webhook).WithMany()
             .HasForeignKey(d => d.WebhookId).OnDelete(DeleteBehavior.Cascade);
            e.Property(d => d.EventType).HasMaxLength(100).IsRequired();
            e.Property(d => d.PayloadJson).IsRequired();
            e.Property(d => d.Status).HasConversion<string>().HasMaxLength(20).IsUnicode(false);
            e.Property(d => d.LastError).HasMaxLength(1000);
        });

        // ── PasswordResetToken ────────────────────────────────────────────────
        modelBuilder.Entity<PasswordResetToken>(e =>
        {
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.UserId);
            e.HasIndex(t => t.ExpiresAt);
            e.HasIndex(t => t.TicketHash);
            e.Property(t => t.CodeHash).HasMaxLength(64);
            e.Property(t => t.TicketHash).HasMaxLength(64);
            e.Property(t => t.UserId).HasMaxLength(450).IsRequired();
            e.Property(t => t.IdentityToken).HasMaxLength(2000).IsRequired();
        });
    }
}
