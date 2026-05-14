namespace Domain.Enums;

/// <summary>Reason a courier was unable to complete a delivery attempt.</summary>
public enum PostponeReason
{
    RecipientDidNotAnswer       = 1,
    WrongRecipientPhoneNumber   = 2,
    RecipientNotAtAddress       = 3,
    RecipientRequestedReschedule = 4,
    AddressNotFound             = 5,
    InsufficientAccessToBuilding = 6,
}
