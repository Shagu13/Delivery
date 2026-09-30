using Application.Finance;
using Domain;

namespace Application.Orders.Queries.ScanOrders;

/// One scanned package as the Scan screen and the courier Excel manifest show it.
public sealed record ScannedOrderDto(
    Guid    OrderId,
    string  TrackingNumber,
    string  Status,
    Guid?   CourierId,
    string? CourierFullName,
    string  RecipientName,
    string  RecipientPhone,
    string  RecipientCity,
    string  RecipientDistrict,
    string  RecipientAddress,
    string? Description,
    bool    IsFragile,
    /// Cash the courier collects — through OrderFinance so the recipient-paid fee is included.
    decimal AmountToCollect,
    DateTime CreatedAt,
    /// Sender's business name, else first + last name (empty when unknown).
    string  SenderName,
    decimal CompanyServicePrice,
    /// Georgian display names — filled only for the Excel export (null otherwise).
    string? RecipientCityGeo = null,
    string? RecipientDistrictGeo = null);

internal static class ScannedOrderMapper
{
    // Send/Exchange own their customer through the batch; standalone Returns directly.
    private static string SenderName(Order o)
    {
        Customer? c = o.GroupOrder?.Customer ?? o.Customer;
        if (c is null) return string.Empty;
        return string.IsNullOrWhiteSpace(c.BusinessName) ? $"{c.FirstName} {c.LastName}".Trim() : c.BusinessName;
    }

    public static ScannedOrderDto ToDto(Order o, string? cityGeo = null, string? districtGeo = null) => new(
        OrderId:           o.Id,
        TrackingNumber:    o.TrackingNumber,
        Status:            o.Status.ToString(),
        CourierId:         o.CourierId,
        CourierFullName:   o.Courier is null ? null : $"{o.Courier.FirstName} {o.Courier.LastName}",
        RecipientName:     o.RecipientName,
        RecipientPhone:    o.RecipientPhone,
        RecipientCity:     o.RecipientCity,
        RecipientDistrict: o.RecipientDistrict,
        RecipientAddress:  o.RecipientAddress,
        Description:       o.Description,
        IsFragile:         o.IsFragile,
        AmountToCollect:   OrderFinance.ExpectedCourierCash(o),
        CreatedAt:         o.CreatedAt,
        SenderName:        SenderName(o),
        CompanyServicePrice: o.CompanyServicePrice,
        RecipientCityGeo:     cityGeo,
        RecipientDistrictGeo: districtGeo);
}
