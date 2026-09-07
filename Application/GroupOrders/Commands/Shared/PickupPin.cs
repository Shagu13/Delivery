using Domain;

namespace Application.GroupOrders.Commands.Shared;

/// <summary>
/// Resolves the exact pick-up coordinates to stamp on a newly created batch.
///
/// A logged-in customer may have a saved map pin on their profile
/// (<see cref="Customer.Latitude"/> / <see cref="Customer.Longitude"/>). We copy it onto
/// the batch's <see cref="GroupOrder.PickUpLatitude"/> only when the order's pickup address
/// still matches the customer's saved address — if the sender typed a different pickup
/// location for this order, the saved pin no longer describes it and is left off.
///
/// Shared by the cart checkout, the partner create-group-order path, and the admin
/// walk-in flow so none of them can drift on when a pin is carried over.
/// </summary>
public static class PickupPin
{
    public static (double? Latitude, double? Longitude) ResolveForNewBatch(
        Customer? customer,
        string pickUpCity,
        string pickUpDistrict,
        string pickUpAddress)
    {
        if (customer is null || customer.Latitude is null || customer.Longitude is null)
            return (null, null);

        bool sameAddress =
            string.Equals(customer.City.Trim(),     pickUpCity.Trim(),     StringComparison.OrdinalIgnoreCase) &&
            string.Equals(customer.District.Trim(), pickUpDistrict.Trim(), StringComparison.OrdinalIgnoreCase) &&
            string.Equals(customer.Address.Trim(),  pickUpAddress.Trim(),  StringComparison.OrdinalIgnoreCase);

        return sameAddress ? (customer.Latitude, customer.Longitude) : (null, null);
    }
}
