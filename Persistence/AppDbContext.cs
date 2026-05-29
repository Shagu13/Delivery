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
    public DbSet<Warehouse>        Warehouses        => Set<Warehouse>();
    public DbSet<GroupOrder>       GroupOrders       => Set<GroupOrder>();
    public DbSet<Order>            Orders            => Set<Order>();
    public DbSet<TrackingEvent>    TrackingEvents    => Set<TrackingEvent>();
    public DbSet<City>             Cities            => Set<City>();
    public DbSet<District>         Districts         => Set<District>();
    public DbSet<DailySettlement>  DailySettlements  => Set<DailySettlement>();
    public DbSet<WeightPriceTier>  WeightPriceTiers  => Set<WeightPriceTier>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<PaymentRequest>   PaymentRequests   => Set<PaymentRequest>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.HasSequence<long>("TrackingNumberSeq", "dbo")
            .StartsAt(1).IncrementsBy(1);

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
        });

        // ── Customer ─────────────────────────────────────────────────────────
        modelBuilder.Entity<Customer>(e =>
        {
            e.HasKey(c => c.Id);
            e.HasIndex(c => c.PhoneNumber).IsUnique();
            e.HasIndex(c => c.City);
            e.HasIndex(c => c.CreatedAt);
            e.HasOne(c => c.ApplicationUser).WithOne()
             .HasForeignKey<Customer>(c => c.ApplicationUserId)
             .OnDelete(DeleteBehavior.Restrict);
            e.HasMany<GroupOrder>()
             .WithOne(g => g.Customer)
             .HasForeignKey(g => g.CustomerId)
             .OnDelete(DeleteBehavior.SetNull);
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
            e.HasIndex(g => g.Status);
            e.HasIndex(g => g.CreatedAt);
            e.HasIndex(g => g.CustomerId);
            e.HasIndex(g => new { g.PickUpCity, g.PickUpDistrict });
            e.HasOne(g => g.Courier).WithMany(c => c.GroupOrders)
             .HasForeignKey(g => g.CourierId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(g => g.Warehouse).WithMany()
             .HasForeignKey(g => g.WarehouseId).OnDelete(DeleteBehavior.SetNull);
            e.HasMany(g => g.Orders).WithOne(o => o.GroupOrder)
             .HasForeignKey(o => o.GroupOrderId).OnDelete(DeleteBehavior.Cascade);
            e.Property(g => g.SenderFirstName).HasMaxLength(100).IsRequired();
            e.Property(g => g.SenderLastName).HasMaxLength(100).IsRequired();
            e.Property(g => g.SenderIdNumber).HasMaxLength(50);
            e.Property(g => g.SenderBusinessName).HasMaxLength(150).IsRequired();
            e.Property(g => g.SenderPhone).HasMaxLength(20).IsRequired();
            e.Property(g => g.PickUpCity).HasMaxLength(100).IsRequired();
            e.Property(g => g.PickUpDistrict).HasMaxLength(100).IsRequired();
            e.Property(g => g.PickUpAddress).HasMaxLength(250).IsRequired();
            e.Property(g => g.Note).HasMaxLength(500);
            e.Property(g => g.Status).HasConversion<string>().HasMaxLength(50);
        });

        // ── Order ─────────────────────────────────────────────────────────────
        modelBuilder.Entity<Order>(e =>
        {
            e.HasKey(o => o.Id);
            e.HasIndex(o => o.Status);
            e.HasIndex(o => o.CreatedAt);
            e.HasIndex(o => o.OrderType);
            e.HasIndex(o => new { o.RecipientCity, o.RecipientDistrict });
            e.HasIndex(o => o.GroupOrderId);
            e.HasIndex(o => o.CompanyServicePaymentStatus);
            e.HasIndex(o => o.HasCompanyPaidTheSender);
            e.HasOne(o => o.Courier).WithMany(c => c.Orders)
             .HasForeignKey(o => o.CourierId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(o => o.Warehouse).WithMany()
             .HasForeignKey(o => o.WarehouseId).OnDelete(DeleteBehavior.SetNull);
            e.HasMany(o => o.TrackingEvents).WithOne()
             .HasForeignKey(t => t.OrderId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(o => o.WeightPriceTier).WithMany()
             .HasForeignKey(o => o.WeightPriceTierId).OnDelete(DeleteBehavior.SetNull);
            // PaymentRequest FK — SetNull so deleting a request doesn't cascade to orders
            e.HasOne(o => o.PaymentRequest).WithMany(p => p.Orders)
             .HasForeignKey(o => o.PaymentRequestId).OnDelete(DeleteBehavior.SetNull);
            e.Property(o => o.RecipientFirstName).HasMaxLength(100).IsRequired();
            e.Property(o => o.RecipientLastName).HasMaxLength(100).IsRequired();
            e.Property(o => o.RecipientPhone).HasMaxLength(20).IsRequired();
            e.Property(o => o.RecipientCity).HasMaxLength(100).IsRequired();
            e.Property(o => o.RecipientDistrict).HasMaxLength(100).IsRequired();
            e.Property(o => o.RecipientAddress).HasMaxLength(250).IsRequired();
            e.Property(o => o.TrackingNumber).HasMaxLength(30).IsRequired();
            e.Property(o => o.Description).HasMaxLength(500);
            e.Property(o => o.Status).HasConversion<string>().HasMaxLength(50);
            e.Property(o => o.OrderType).HasConversion<string>().HasMaxLength(20);
            e.Property(o => o.ProductPaymentStatus).HasConversion<string>().HasMaxLength(20);
            e.Property(o => o.WhoPaysForCompanyService).HasConversion<string>().HasMaxLength(20);
            e.Property(o => o.CompanyServicePaymentStatus).HasConversion<string>().HasMaxLength(20);
            e.Property(o => o.ReturnPickupAddress).HasMaxLength(250);
            e.Property(o => o.ReturnPickupCity).HasMaxLength(100);
            e.Property(o => o.ReturnPickupDistrict).HasMaxLength(100);
            e.Property(o => o.CourierSalary).HasColumnType("decimal(18,2)");
            e.Property(o => o.CompanyServicePrice).HasColumnType("decimal(18,2)");
            e.Property(o => o.CompanyRevenue).HasColumnType("decimal(18,2)");
            e.Property(o => o.AmountOfCashCollected).HasColumnType("decimal(18,2)");
            e.Property(o => o.AmountToCollectForPackage).HasColumnType("decimal(18,2)");
        });

        // ── DailySettlement ───────────────────────────────────────────────────
        modelBuilder.Entity<DailySettlement>(e =>
        {
            e.HasKey(d => d.Id);
            e.HasIndex(d => d.CourierId);
            e.HasIndex(d => d.CreatedAt);
            e.HasIndex(d => new { d.CourierId, d.CreatedAt });
            e.HasIndex(d => d.WasCourierPaid);
            e.HasIndex(d => d.HasCourierHandedOverRevenue);
            e.HasOne(d => d.Courier).WithMany(c => c.DailySettlements)
             .HasForeignKey(d => d.CourierId).OnDelete(DeleteBehavior.Restrict);
            e.Property(d => d.TotalAmountOfCashCollected).HasColumnType("decimal(18,2)");
            e.Property(d => d.TotalCompanyServiceRevenue).HasColumnType("decimal(18,2)");
            e.Property(d => d.TotalCompanyNetIncome).HasColumnType("decimal(18,2)");
            e.Property(d => d.TotalCourierSalary).HasColumnType("decimal(18,2)");
            e.Property(d => d.TotalCourierTransferToCompany).HasColumnType("decimal(18,2)");
        });

        // ── PaymentRequest ────────────────────────────────────────────────────
        modelBuilder.Entity<PaymentRequest>(e =>
        {
            e.HasKey(p => p.Id);
            e.HasIndex(p => p.Type);
            e.HasIndex(p => p.Status);
            e.HasIndex(p => p.CustomerId);
            e.HasIndex(p => p.CourierId);
            e.HasIndex(p => p.CreatedAt);
            e.HasOne(p => p.Customer).WithMany()
             .HasForeignKey(p => p.CustomerId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(p => p.Courier).WithMany()
             .HasForeignKey(p => p.CourierId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(p => p.DailySettlement).WithMany(d => d.PaymentRequests)
             .HasForeignKey(p => p.DailySettlementId).OnDelete(DeleteBehavior.SetNull);
            e.Property(p => p.TotalAmount).HasColumnType("decimal(18,2)");
            e.Property(p => p.AmountConfirmed).HasColumnType("decimal(18,2)");
            e.Property(p => p.Type).HasConversion<string>().HasMaxLength(40);
            e.Property(p => p.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(p => p.Note).HasMaxLength(500);
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

        // ── PasswordResetToken ────────────────────────────────────────────────
        modelBuilder.Entity<PasswordResetToken>(e =>
        {
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.Code).IsUnique();
            e.HasIndex(t => t.UserId);
            e.HasIndex(t => t.ExpiresAt);
            e.Property(t => t.Code).HasMaxLength(20).IsRequired();
            e.Property(t => t.UserId).HasMaxLength(450).IsRequired();
            e.Property(t => t.IdentityToken).HasMaxLength(2000).IsRequired();
        });
    }
}
