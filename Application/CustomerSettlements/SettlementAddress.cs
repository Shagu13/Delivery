using Domain;
using Domain.Enums;

namespace Application.CustomerSettlements;

/// <summary>
/// The location a finance/settlement row shows for an order. For a Return that is where the courier
/// collected the parcel (<c>ReturnPickup*</c> — the recipient's address); its <c>Recipient*</c> fields hold
/// the sender/business the parcel goes back to, which is not useful on a settlement line. Every other
/// order shows its recipient address. Shared by the finance lines (screen + Excel), the settlement
/// invoice and the payment receipts so they always agree.
/// </summary>
internal static class SettlementAddress
{
    public readonly record struct Location(string City, string District, string Address);

    public static Location Of(Order o) =>
        o.OrderType == OrderType.Return && !string.IsNullOrWhiteSpace(o.ReturnPickupAddress)
            ? new Location(o.ReturnPickupCity ?? string.Empty, o.ReturnPickupDistrict ?? string.Empty, o.ReturnPickupAddress)
            : new Location(o.RecipientCity, o.RecipientDistrict, o.RecipientAddress);
}
