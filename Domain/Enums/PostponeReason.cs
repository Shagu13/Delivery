namespace Domain.Enums;

/// <summary>Reason a courier was unable to complete a delivery attempt.</summary>
public enum PostponeReason
{
    RecipientDidNotAnswer       = 1,
    WrongRecipientPhoneNumber   = 2,
    RecipientNotAtAddress       = 3,
    RecipientRequestedReschedule = 4,
    AddressNotFound             = 5,
    /// <summary>Free-text reason — the accompanying comment is captured on <see cref="Order.PostponeComment"/>.</summary>
    Other                       = 6,
}
