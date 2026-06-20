namespace Domain.Enums;

/// <summary>Reason a courier cancelled a delivery (recipient declined the parcel).</summary>
public enum CancellationReason
{
    DidNotLike = 1,
    DidNotWant = 2,
    WrongSize  = 3,
    Other      = 4,
}
