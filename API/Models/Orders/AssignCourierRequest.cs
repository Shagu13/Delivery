namespace API.Models.Orders;

/// <summary>Request body for any assign-courier endpoint.</summary>
public sealed record AssignCourierRequest(Guid CourierId);
