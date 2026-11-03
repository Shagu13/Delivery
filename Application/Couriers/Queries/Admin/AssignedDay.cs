using Domain;
using Domain.Enums;

namespace Application.Couriers.Queries.Admin;

/// <summary>
/// The "orders on a courier's assigned day" rule shared by the Couriers page list
/// (<see cref="GetAssignedOrdersForDayQuery"/>) and its per-courier Excel export
/// (<see cref="GetAssignedOrdersExportQuery"/>), so the two always agree.
///
/// An order belongs to the Georgian day it was last assigned to its current courier
/// (<see cref="Order.AssignedToCourierAt"/>), so a reassignment moves it onto the new day.
/// Today's view additionally carries over still-open deliveries assigned on earlier days,
/// unless the admin switched that off (<c>includePrevious = false</c>).
/// </summary>
internal static class AssignedDay
{
    /// <summary>Open last-mile statuses: shown on today's assigned list even when assigned on an earlier day.</summary>
    private static readonly OrderStatus[] CarryOverStatuses =
    {
        OrderStatus.CourierAssignedToDeliver,
        OrderStatus.CourierDeliveringTheOrderToRecipient,
        OrderStatus.DeliveryPostponed,
    };

    /// <summary>Carry-over applies only to today's view, and only when the caller asked for it.</summary>
    public static bool CarriesOver(DateTime day, bool includePrevious) => includePrevious && day == CustomTime.Today;

    public static IQueryable<Order> OnAssignedDay(this IQueryable<Order> orders, DateTime day, bool carryOver)
    {
        DateTime dayEnd = day.AddDays(1);
        return orders.Where(o => (o.AssignedToCourierAt >= day && o.AssignedToCourierAt < dayEnd)
                              || (carryOver && o.AssignedToCourierAt < day
                                  && CarryOverStatuses.Contains(o.Status)));
    }
}
