namespace Domain.Enums;

/// <summary>
/// Why an order was cancelled. 1-4 are courier-side reasons (recipient declined the
/// parcel); WarehouseNotReceived is set by an admin when a batch's package never
/// physically arrived at the warehouse during acceptance.
/// </summary>
public enum CancellationReason
{
    DidNotLike = 1,
    DidNotWant = 2,
    WrongSize  = 3,
    Other      = 4,
    WarehouseNotReceived = 5,
}
