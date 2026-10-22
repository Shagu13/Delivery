using Application.Common.Interfaces;
using Application.Finance;
using Application.GroupOrders.Commands.Shared;
using Domain;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Commands.ChangeOrderPayer;

/// <summary>
/// Resolves the company service fee of an EXISTING order the same way order creation does
/// (weight-tier zone price → customer's per-district special price → customer's negotiated
/// capital/city/district rate → district default), by reusing <see cref="GroupOrderOrderBuilder"/>'s
/// shared waterfall helpers. Used by the admin payer-change preview so the suggested fee can never
/// drift from what a freshly created order would be charged.
/// </summary>
internal static class OrderServiceFeeResolver
{
    /// <param name="order">Must have <see cref="Order.GroupOrder"/> loaded (its pickup location drives the pickup-swap rule).</param>
    public static async Task<(decimal? Fee, OrderFeeSource Source)> ResolveAsync(
        IAppDbContext context, Order order, CancellationToken ct)
    {
        Guid? customerId = order.GroupOrder?.CustomerId ?? order.CustomerId;
        Customer? customer = customerId.HasValue
            ? await context.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == customerId.Value, ct)
            : null;

        string? pickUpName = order.GroupOrder?.PickUpDistrict;
        List<string> districtNames = new[] { order.RecipientDistrict, order.ReturnPickupDistrict, pickUpName }
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Select(n => n!)
            .Distinct()
            .ToList();

        List<District> districts = await context.Districts
            .AsNoTracking()
            .Where(d => d.DateDeleted == null && districtNames.Contains(d.DistrictName))
            .ToListAsync(ct);

        List<Guid> cityIds = districts.Select(d => d.CityId).Distinct().ToList();
        Dictionary<Guid, string> cityNames = cityIds.Count > 0
            ? await context.Cities.AsNoTracking()
                .Where(c => cityIds.Contains(c.Id))
                .ToDictionaryAsync(c => c.Id, c => c.CityName, ct)
            : new Dictionary<Guid, string>();

        Dictionary<Guid, decimal> specialPrices = new();
        if (customer is not null && districts.Count > 0)
        {
            List<Guid> districtIds = districts.Select(d => d.Id).ToList();
            specialPrices = await context.CustomerSpecialPrices
                .AsNoTracking()
                .Where(s => s.CustomerId == customer.Id && districtIds.Contains(s.DistrictId))
                .ToDictionaryAsync(s => s.DistrictId, s => s.Price, ct);
        }

        WeightPriceTier? tier = order.WeightPriceTierId.HasValue
            ? await context.WeightPriceTiers.AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == order.WeightPriceTierId.Value && t.DateDeleted == null, ct)
            : null;

        District? pickUpDistrict = string.IsNullOrWhiteSpace(pickUpName)
            ? null
            : GroupOrderOrderBuilder.FindDistrict(districts, cityNames, order.GroupOrder?.PickUpCity, pickUpName);
        bool pickUpCanSwapPricing = pickUpDistrict is not null && !pickUpDistrict.IsCapitalTerritory;

        (District? pricingDistrict, District? customerZone) = GroupOrderOrderBuilder.ResolveZones(
            districts, cityNames, order.OrderType, order.RecipientCity, order.RecipientDistrict,
            order.ReturnPickupCity, order.ReturnPickupDistrict, pickUpDistrict, pickUpCanSwapPricing);

        (decimal price, OrderFeeSource source) = GroupOrderOrderBuilder.ResolveCalculatedFee(
            tier, customer, pricingDistrict, customerZone, specialPrices);

        return price > 0m ? (price, source) : (null, OrderFeeSource.None);
    }
}
