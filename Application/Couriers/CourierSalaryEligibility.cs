namespace Application.Couriers;

/// <summary>
/// The metro cities (Tbilisi, Rustavi) whose couriers settle by delivery date — see
/// <see cref="CourierDateBasisPolicy"/>. No longer gates salary: every courier can carry
/// per-zone salaries (<see cref="CourierSalaryResolver"/>).
/// </summary>
public static class CourierSalaryEligibility
{
    public static readonly string[] EligibleCities = { "Tbilisi", "Rustavi" };

    public static bool IsEligible(string assignedCity) =>
        EligibleCities.Any(c => c.Equals(assignedCity.Trim(), StringComparison.OrdinalIgnoreCase));
}
