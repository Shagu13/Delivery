using API.Middleware;
using API.Realtime;
using Application;
using Application.Common.Interfaces;
using Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using Persistence;
using Serilog;
using System.Text.Json;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

// ── Serilog ─────────────────────────────────────────────────────────────────
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .MinimumLevel.Override("Microsoft", Serilog.Events.LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.EntityFrameworkCore", Serilog.Events.LogEventLevel.Warning)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .WriteTo.File(
        path: "logs/delivery-app-.txt",
        rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: 30,
        outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff} [{Level:u3}] {Message:lj}{NewLine}{Exception}")
    .CreateLogger();

try
{
    Log.Information("Starting Delivery App API");

    builder.Host.UseSerilog();

    // ── CORS ─────────────────────────────────────────────────────────────────
    var allowedOrigins = builder.Configuration
        .GetSection("AllowedOrigins")
        .Get<string[]>() ?? Array.Empty<string>();

    builder.Services.AddCors(options =>
    {
        options.AddPolicy("AllowFrontend", policy =>
        {
            policy
                .WithOrigins([
                    "http://localhost:3000",
                "https://localhost:3000",
                ..allowedOrigins
                ])
                .AllowAnyMethod()
                .AllowAnyHeader()
                .AllowCredentials();
        });
    });

    // ── Layer registrations ──────────────────────────────────────────────────
    builder.Services.AddApplication();
    builder.Services.AddPersistence(builder.Configuration);
    builder.Services.AddInfrastructure(builder.Configuration);

    // ── Partner API-key authentication ─────────────────────────────────────────
    // Registered as an extra scheme alongside the JWT default (set in Infrastructure).
    // Partner endpoints opt in via [Authorize(AuthenticationSchemes = "ApiKey")].
    builder.Services.AddAuthentication()
        .AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, API.Auth.ApiKeyAuthenticationHandler>(
            API.Auth.ApiKeyAuthenticationHandler.SchemeName, null);

    // ── Controllers ──────────────────────────────────────────────────────────
    builder.Services.AddControllers()
        .AddJsonOptions(o =>
        {
            // Enums as strings throughout the API (e.g. "Pending" not 0)
            o.JsonSerializerOptions.Converters.Add(
                new JsonStringEnumConverter());
        });

    // ── SignalR (real-time admin badge counts) ───────────────────────────────
    builder.Services.AddSignalR()
        .AddJsonProtocol(o =>
        {
            o.PayloadSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
            o.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        });
    builder.Services.AddSingleton<IPendingCountsNotifier, PendingCountsNotifier>();
    builder.Services.AddSingleton<IRealtimeNotifier, RealtimeNotifier>();

    // ── Partner webhooks: outbound delivery worker ─────────────────────────────
    builder.Services.AddHttpClient("webhooks", c => c.Timeout = TimeSpan.FromSeconds(10));
    builder.Services.AddHostedService<API.Webhooks.WebhookSenderService>();

    // ── Swagger ──────────────────────────────────────────────────────────────
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(options =>
    {
        options.SwaggerDoc("v1", new OpenApiInfo
        {
            Title = "Delivery Management API",
            Version = "v1",
            Description = "Courier pickup and last-mile delivery operations."
        });

        var securityScheme = new OpenApiSecurityScheme
        {
            Name = "Authorization",
            Description = "Enter: Bearer {your token}",
            In = ParameterLocation.Header,
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            Reference = new OpenApiReference
            {
                Type = ReferenceType.SecurityScheme,
                Id = "Bearer"
            }
        };

        options.AddSecurityDefinition("Bearer", securityScheme);
        options.AddSecurityRequirement(new OpenApiSecurityRequirement
        {
            { securityScheme, Array.Empty<string>() }
        });
    });

    var app = builder.Build();

    // ── Database: migrate + seed ─────────────────────────────────────────────
    using (var scope = app.Services.CreateScope())
    {
        var services = scope.ServiceProvider;
        try
        {
            var context = services.GetRequiredService<AppDbContext>();

            var pendingMigrations = await context.Database.GetPendingMigrationsAsync();
            var hasPendingMigrations = pendingMigrations.Any();

            // In development: always migrate.
            // In production: only migrate if RUN_MIGRATIONS=true is set explicitly.
            // This prevents accidental schema changes on production deployments.
            var runMigrations = app.Environment.IsDevelopment()
                || Environment.GetEnvironmentVariable("RUN_MIGRATIONS") == "true";

            if (hasPendingMigrations && !runMigrations)
            {
                Log.Warning(
                    "PRODUCTION WARNING: {Count} pending migration(s) detected but RUN_MIGRATIONS is not set. " +
                    "App will start but may not work correctly. Pending: {Migrations}",
                    pendingMigrations.Count(),
                    string.Join(", ", pendingMigrations));
            }

            if (runMigrations && hasPendingMigrations)
            {
                Log.Information("Applying {Count} pending migration(s)...", pendingMigrations.Count());
                await context.Database.MigrateAsync();
                Log.Information("Migrations applied successfully.");
            }

            // Seed roles + default admin account
            await Persistence.DependencyInjectionPersistence.SeedAsync(services);

        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "An error occurred during database migration or seeding.");
            throw;
        }
    }

    // ── Middleware pipeline ──────────────────────────────────────────────────
    // Order matters: Exception handler wraps everything first
    app.UseMiddleware<ExceptionHandlingMiddleware>();

    if (app.Environment.IsDevelopment())
    {
        app.UseSwagger();
        app.UseSwaggerUI(c =>
            c.SwaggerEndpoint("/swagger/v1/swagger.json", "Delivery API v1"));
    }
    app.UseStaticFiles();
    app.UseCors("AllowFrontend");
    app.UseHttpsRedirection();
    app.UseAuthentication();
    app.UseAuthorization();
    app.MapControllers();
    app.MapHub<NotificationsHub>("/hubs/notifications");
    app.MapFallbackToFile("index.html");

    Log.Information("Delivery App API started successfully.");
    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application terminated unexpectedly.");
}
finally
{
    Log.CloseAndFlush();
}
