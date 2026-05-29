using Domain;
using Microsoft.EntityFrameworkCore;

namespace Application.Common.Interfaces;

public interface IAppDbContext
{
    DbSet<Domain.Courier>       Couriers             { get; }
    DbSet<Customer>             Customers            { get; }
    DbSet<Warehouse>            Warehouses           { get; }
    DbSet<GroupOrder>           GroupOrders          { get; }
    DbSet<Order>                Orders               { get; }
    DbSet<TrackingEvent>        TrackingEvents       { get; }
    DbSet<City>                 Cities               { get; }
    DbSet<District>             Districts            { get; }
    DbSet<DailySettlement>      DailySettlements     { get; }
    DbSet<WeightPriceTier>      WeightPriceTiers     { get; }
    DbSet<PasswordResetToken>   PasswordResetTokens  { get; }
    DbSet<PaymentRequest>       PaymentRequests      { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
