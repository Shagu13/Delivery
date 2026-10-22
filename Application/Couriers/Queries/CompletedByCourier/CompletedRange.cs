namespace Application.Couriers.Queries.CompletedByCourier;

/// <summary>Shared limit for the Couriers "Completed" reads — keeps one request from loading years of orders.</summary>
internal static class CompletedRange
{
    public const int MaxDays = 93;
}
