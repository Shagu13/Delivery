using Application.Common.Interfaces;
using Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Persistence.Interceptors;
using Persistence.Services;

namespace Persistence;

public static class DependencyInjectionPersistence
{
    public static IServiceCollection AddPersistence(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Pushes admin badge counts over SignalR after relevant saves (replaces polling).
        services.AddScoped<PendingCountsChangeInterceptor>();
        // Pushes "refetch" pings to admin + courier dashboards after order/assignment saves.
        services.AddScoped<RealtimeDashboardInterceptor>();
        // Enqueues partner webhook deliveries (outbox) when an order's status changes.
        services.AddScoped<WebhookOutboxInterceptor>();

        services.AddDbContext<AppDbContext>((sp, options) =>
            options
                .UseSqlServer(
                    configuration.GetConnectionString("DefaultConnection"),
                    sql => sql
                        .MigrationsAssembly(typeof(AppDbContext).Assembly.FullName)
                        .EnableRetryOnFailure(maxRetryCount: 3)
                        .CommandTimeout(30))
                .AddInterceptors(
                    sp.GetRequiredService<PendingCountsChangeInterceptor>(),
                    sp.GetRequiredService<RealtimeDashboardInterceptor>(),
                    sp.GetRequiredService<WebhookOutboxInterceptor>()));

        services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());
        services.AddScoped<ITrackingNumberGenerator, TrackingNumberGenerator>();

        // AddIdentityCore instead of AddIdentity
        // AddIdentity overwrites JWT bearer with cookie auth and redirects to /Account/Login
        // AddIdentityCore only sets up user/role management — JWT stays as the auth scheme
        services.AddIdentityCore<ApplicationUser>(options =>
        {
            options.Password.RequireDigit            = true;
            options.Password.RequiredLength          = 8;
            options.Password.RequireUppercase        = true;
            options.Password.RequireLowercase        = true;
            options.Password.RequireNonAlphanumeric  = true;   // require at least one symbol
            options.Lockout.MaxFailedAccessAttempts  = 5;
            options.Lockout.DefaultLockoutTimeSpan   = TimeSpan.FromMinutes(15);
            options.User.RequireUniqueEmail          = true;
        })
        .AddRoles<IdentityRole>()
        .AddEntityFrameworkStores<AppDbContext>()
        .AddDefaultTokenProviders();
            
        // ── Password-reset token lifespan ─────────────────────────────────────
        // Controls only the Identity DataProtection tokens (password reset,
        // email confirmation).  JWT login tokens are NOT affected — those are
        // configured separately in JwtTokenGenerator / JwtSettings.
        services.Configure<DataProtectionTokenProviderOptions>(opt =>
            opt.TokenLifespan = TimeSpan.FromHours(2));

        return services;
    }

    public static async Task SeedAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var sp = scope.ServiceProvider;

        var roleManager = sp.GetRequiredService<RoleManager<IdentityRole>>();
        var userManager = sp.GetRequiredService<UserManager<ApplicationUser>>();
        var config      = sp.GetRequiredService<IConfiguration>();

        foreach (var role in new[] { "Admin", "Operator", "Courier", "Customer", "TenantAdmin" })
        {
            if (!await roleManager.RoleExistsAsync(role))
                await roleManager.CreateAsync(new IdentityRole(role));
        }

        // Read admin phone from config so it can be changed without a code deploy.
        // Set "AdminSeed:PhoneNumber" in appsettings or environment variables.
        // Example: "995599000000"
        // Leave empty to skip — SMS alerts simply won't fire until a number is set.
        var adminPhone = config["AdminSeed:PhoneNumber"];

        const string adminUsername = "admin";
        var existing = await userManager.FindByNameAsync(adminUsername);

        if (existing is null)
        {
            var admin = new ApplicationUser
            {
                UserName    = adminUsername,
                Email       = "admin@dilodelivery.com",
                NormalizedEmail = "ADMIN@DILODELIVERY.COM",
                FirstName   = "System",
                LastName    = "Admin",
                Role        = "Admin",
                PhoneNumber = string.IsNullOrWhiteSpace(adminPhone) ? null : adminPhone
            };

            var result = await userManager.CreateAsync(admin, "Admin@12345");
            if (result.Succeeded)
                await userManager.AddToRoleAsync(admin, "Admin");
        }
        else if (!string.IsNullOrWhiteSpace(adminPhone)
                 && existing.PhoneNumber != adminPhone)
        {
            existing.PhoneNumber = adminPhone;
            await userManager.UpdateAsync(existing);
        }

        // ── System admin ─────────────────────────────────────────────────────
        // A second Admin-role account that additionally owns the white-label
        // Tenants management page (create/edit tenants); the ordinary "admin"
        // account does not see that page. Both are otherwise full admins.
        // The password hash is set directly (rather than via CreateAsync(user,
        // password)) so the requested credential is honored verbatim even though
        // it omits the uppercase letter the configured password policy requires.
        const string systemAdminUsername = "systemadmin";
        if (await userManager.FindByNameAsync(systemAdminUsername) is null)
        {
            var systemAdmin = new ApplicationUser
            {
                UserName        = systemAdminUsername,
                Email           = "systemadmin@dilodelivery.com",
                NormalizedEmail = "SYSTEMADMIN@DILODELIVERY.COM",
                FirstName       = "System",
                LastName        = "Admin",
                Role            = "Admin",
            };
            systemAdmin.PasswordHash = userManager.PasswordHasher.HashPassword(systemAdmin, "systemadmin@12345!");

            var systemAdminResult = await userManager.CreateAsync(systemAdmin);
            if (systemAdminResult.Succeeded)
                await userManager.AddToRoleAsync(systemAdmin, "Admin");
        }

        // ── White-label tenant bootstrap (livo) ──────────────────────────────
        // Seeds the demo Tenant + its co-admin (TenantAdmin role) so the tenant
        // flow is testable. Idempotent: creates only what's missing.
        var db = sp.GetRequiredService<AppDbContext>();

        const string livoHost     = "livo.ge";
        const string livoUsername = "livo";

        // Find (or create) the co-admin login first, then key idempotency off the user —
        // one TenantAdmin owns at most one tenant (unique index on AdminApplicationUserId).
        // Keying off the user (not the host) means an admin can later rename the tenant's
        // host (e.g. livo.ge → livoexpress.ge) without the seed trying to re-create it.
        var coAdmin = await userManager.FindByNameAsync(livoUsername);
        if (coAdmin is null)
        {
            coAdmin = new ApplicationUser
            {
                UserName        = livoUsername,
                Email           = "livo@livo.ge",
                NormalizedEmail = "LIVO@LIVO.GE",
                FirstName       = "Livo",
                LastName        = "Admin",
                Role            = "TenantAdmin",
            };
            var created = await userManager.CreateAsync(coAdmin, "Livo@12345");
            if (created.Succeeded)
                await userManager.AddToRoleAsync(coAdmin, "TenantAdmin");
            else
                coAdmin = null;   // creation failed → don't link a broken FK
        }

        if (coAdmin is not null)
        {
            bool alreadyHasTenant = await db.Tenants.AnyAsync(t => t.AdminApplicationUserId == coAdmin.Id);
            if (!alreadyHasTenant)
            {
                db.Tenants.Add(new Tenant
                {
                    Host                   = livoHost,
                    DisplayName            = "Livo",
                    AdminApplicationUserId = coAdmin.Id,
                    IsActive               = true,
                });
                await db.SaveChangesAsync();
            }
        }
    }
}
