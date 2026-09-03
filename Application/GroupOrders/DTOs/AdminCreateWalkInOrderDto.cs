namespace Application.GroupOrders.DTOs;

/// <summary>
/// Input for the admin "Add Package" flow — an office walk-in customer handing packages
/// over the counter. Either <see cref="ExistingCustomerId"/> (the admin picked a suggested
/// customer) or <see cref="NewCustomer"/> (manual entry) is supplied, never both.
///
/// Send/Exchange packages are placed into a single GroupOrder created straight in
/// <c>AdminAcceptedOrderInWareHouse</c> (the customer is physically at the office, so no
/// courier pickup happens). Return packages are created standalone in the normal Return
/// flow (<c>Pending</c>), to be assigned a pickup courier afterwards.
/// </summary>
public sealed record AdminCreateWalkInOrderDto(
    Guid?                         ExistingCustomerId,
    WalkInCustomerDto?            NewCustomer,
    IReadOnlyList<CreateOrderDto> Orders
);

/// <summary>
/// Details an admin types for a walk-in customer who has no account. If the phone number,
/// ID number AND business name all match an existing customer the order is placed against
/// that record instead; otherwise a new account-less Customer row is created
/// (ApplicationUserId = null), to be linked when the person later registers.
/// </summary>
public sealed record WalkInCustomerDto(
    string FirstName,
    string LastName,
    string IdNumber,
    string BusinessName,
    string PhoneNumber,
    string City,
    string District,
    string Address
);
