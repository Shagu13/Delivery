using Domain;
using Microsoft.EntityFrameworkCore;

namespace Application.Common.Interfaces;

public interface IAppDbContext
{
    DbSet<Domain.Courier>       Couriers             { get; }
    DbSet<Customer>             Customers            { get; }
    DbSet<Tenant>               Tenants              { get; }
    DbSet<TenantSettlement>     TenantSettlements    { get; }
    DbSet<Warehouse>            Warehouses           { get; }
    DbSet<GroupOrder>           GroupOrders          { get; }
    DbSet<Order>                Orders               { get; }
    DbSet<TrackingEvent>        TrackingEvents       { get; }
    DbSet<City>                 Cities               { get; }
    DbSet<District>             Districts            { get; }
    DbSet<WeightPriceTier>      WeightPriceTiers     { get; }
    DbSet<PasswordResetToken>   PasswordResetTokens  { get; }
    DbSet<PartnerApiKey>        PartnerApiKeys       { get; }
    DbSet<PartnerWebhook>       PartnerWebhooks      { get; }
    DbSet<WebhookDelivery>      WebhookDeliveries    { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
