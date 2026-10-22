using MediatR;

namespace Application.Orders.Commands.SetCourierSalaryBulk;

/// <summary>Admin sets the same courier salary on many orders at once (Couriers page → Edit salary).</summary>
public sealed record SetCourierSalaryBulkCommand(IReadOnlyList<Guid> OrderIds, decimal Salary) : IRequest<int>;
