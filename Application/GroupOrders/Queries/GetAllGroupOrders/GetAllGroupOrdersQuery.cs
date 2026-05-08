using MediatR;
using System;
using System.Collections.Generic;
using System.Text;

namespace Application.GroupOrders.Queries.GetAllGroupOrders
{
    /// <summary>
    /// Returns all group orders (newest first), each with its child orders.
    /// An optional <see cref="SearchTerm"/> filters across sender fields,
    /// recipient fields, phone numbers, and tracking numbers.
    /// </summary>
    public sealed record GetAllGroupOrdersQuery(string? SearchTerm) : IRequest<IReadOnlyList<AdminGroupOrderDto>>;
}
