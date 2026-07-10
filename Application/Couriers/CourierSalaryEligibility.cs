namespace Application.Couriers;

/// <summary>
/// Cities whose couriers get a standard per-order rate (<see cref="Domain.Courier.DefaultSalary"/>);
/// couriers assigned elsewhere are priced manually per order.
/// </summary>
public static class CourierSalaryEligibility
{
    public static readonly string[] EligibleCities = { "Tbilisi", "Rustavi" };

    public static bool IsEligible(string assignedCity) =>
        EligibleCities.Any(c => c.Equals(assignedCity.Trim(), StringComparison.OrdinalIgnoreCase));
}
