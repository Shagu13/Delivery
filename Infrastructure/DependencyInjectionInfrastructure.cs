using Application.Common.Interfaces;
using Infrastructure.Services;
using Infrastructure.Sms;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using System.Text;

namespace Infrastructure;

public static class DependencyInjectionInfrastructure
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var jwtSection = configuration.GetSection(JwtSettings.SectionName);
        services.Configure<JwtSettings>(jwtSection);

        var jwtSettings = jwtSection.Get<JwtSettings>();

        // Guard: skip JWT + auth setup if running at design time (e.g. dotnet ef migrations)
        if (jwtSettings is null)
            return services;

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer           = true,
                    ValidateAudience         = true,
                    ValidateLifetime         = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer              = jwtSettings.Issuer,
                    ValidAudience            = jwtSettings.Audience,
                    IssuerSigningKey         = new SymmetricSecurityKey(
                        Encoding.UTF8.GetBytes(jwtSettings.Secret)),
                    ClockSkew = TimeSpan.FromSeconds(30)
                };

                // SignalR WebSocket/SSE connections can't send an Authorization
                // header. The client stores the JWT in an HttpOnly "hubToken" cookie
                // (scoped to /hubs) which the browser attaches to the handshake, so
                // the token stays out of the URL. We still accept the legacy
                // ?access_token=... query as a fallback. Applies to /hubs only.
                options.Events = new JwtBearerEvents
                {
                    OnMessageReceived = context =>
                    {
                        var path = context.HttpContext.Request.Path;
                        if (path.StartsWithSegments("/hubs"))
                        {
                            var fromCookie = context.Request.Cookies["hubToken"];
                            var fromQuery  = context.Request.Query["access_token"];
                            if (!string.IsNullOrEmpty(fromCookie))
                                context.Token = fromCookie;
                            else if (!string.IsNullOrEmpty(fromQuery))
                                context.Token = fromQuery;
                        }
                        return Task.CompletedTask;
                    }
                };
            });

        services.AddAuthorization();

        // ── Cache ────────────────────────────────────────────────────────────
        var redisConnection = configuration.GetConnectionString("Redis");
        if (!string.IsNullOrWhiteSpace(redisConnection))
        {
            services.AddStackExchangeRedisCache(options =>
            {
                options.Configuration = redisConnection;
                options.InstanceName  = "DeliveryApp:";
            });
        }
        else
        {
            services.AddDistributedMemoryCache();
        }

        services.AddScoped<IJwtTokenGenerator, JwtTokenGenerator>();
        services.AddScoped<ICacheService, CacheService>();

        // ── SMS ──────────────────────────────────────────────────────────────
        // HttpClient is registered via the factory so it participates in
        // connection pooling and handler lifetime management.
        services.AddHttpClient<ISmsService, SmsService>();
        services.AddScoped<IAdminNotificationSmsService,     AdminNotificationSmsService>();
        services.AddScoped<IRecipientNotificationSmsService, RecipientNotificationSmsService>();
        services.AddScoped<IPasswordResetSmsService,         PasswordResetSmsService>();

        return services;
    }
}
