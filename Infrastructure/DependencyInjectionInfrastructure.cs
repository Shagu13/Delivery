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
                // header, so the client passes the JWT as ?access_token=... on the
                // hub URL. Pull it from the query string for /hubs requests only.
                options.Events = new JwtBearerEvents
                {
                    OnMessageReceived = context =>
                    {
                        var accessToken = context.Request.Query["access_token"];
                        var path = context.HttpContext.Request.Path;
                        if (!string.IsNullOrEmpty(accessToken)
                            && path.StartsWithSegments("/hubs"))
                        {
                            context.Token = accessToken;
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
