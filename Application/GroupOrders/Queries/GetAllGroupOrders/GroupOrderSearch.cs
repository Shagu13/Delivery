using Application.Common.Interfaces;
using Application.Common.Search;

namespace Application.GroupOrders.Queries.GetAllGroupOrders;

/// <summary>
/// The free-text search behind <see cref="GetAllGroupOrdersQueryHandler"/>, as id sub-queries.
///
/// Every searched column has its own index and every match is a sargable prefix
/// (<c>LIKE 'term%'</c>), but written as one <c>WHERE a LIKE … OR b LIKE … OR EXISTS(…)</c>
/// across GroupOrders, Orders and Customers SQL Server cannot seek any of them and scans the
/// whole history instead (2–6 s per search in production). Here each column is its own
/// branch of a <c>UNION ALL</c>, so each branch is an index seek; the handler then narrows
/// with <c>Id IN (…)</c>. Still one round trip — nothing is materialised.
///
/// Matching rules are unchanged: <c>matchesSender</c> / <c>matchesRecipient</c> come from the
/// request's Party, and the tracking number always matches regardless of party.
/// </summary>
internal static class GroupOrderSearch
{
    /// <summary>Ids of batches whose sender fields, or any live child order's recipient fields / tracking number, start with <paramref name="term"/>.</summary>
    public static IQueryable<Guid> MatchingGroupOrderIds(
        IAppDbContext db, string term, bool matchesSender, bool matchesRecipient)
    {
        List<IQueryable<Guid>> parts = new();

        if (matchesSender)
        {
            parts.Add(db.GroupOrders.Where(go => go.SenderFirstName.StartsWith(term)).Select(go => go.Id));
            parts.Add(db.GroupOrders.Where(go => go.SenderLastName.StartsWith(term)).Select(go => go.Id));
            foreach (string variant in BusinessNameSearch.Variants(term))
                parts.Add(db.GroupOrders.Where(go => go.SenderBusinessName.StartsWith(variant)).Select(go => go.Id));
            parts.Add(db.GroupOrders.Where(go => go.SenderPhone.StartsWith(term)).Select(go => go.Id));
            parts.Add(db.GroupOrders.Where(go => go.AlternativeSenderPhone != null && go.AlternativeSenderPhone.StartsWith(term)).Select(go => go.Id));
            parts.Add(db.GroupOrders.Where(go => go.PickUpCity.StartsWith(term)).Select(go => go.Id));
            parts.Add(db.GroupOrders.Where(go => go.PickUpDistrict.StartsWith(term)).Select(go => go.Id));
            parts.Add(db.GroupOrders.Where(go => go.PickUpAddress.StartsWith(term)).Select(go => go.Id));
        }

        if (matchesRecipient)
        {
            parts.Add(db.Orders.Where(o => o.GroupOrderId != null && o.RecipientName.StartsWith(term)).Select(o => o.GroupOrderId!.Value));
            parts.Add(db.Orders.Where(o => o.GroupOrderId != null && o.RecipientPhone.StartsWith(term)).Select(o => o.GroupOrderId!.Value));
            parts.Add(db.Orders.Where(o => o.GroupOrderId != null && o.RecipientCity.StartsWith(term)).Select(o => o.GroupOrderId!.Value));
            parts.Add(db.Orders.Where(o => o.GroupOrderId != null && o.RecipientDistrict.StartsWith(term)).Select(o => o.GroupOrderId!.Value));
            parts.Add(db.Orders.Where(o => o.GroupOrderId != null && o.RecipientAddress.StartsWith(term)).Select(o => o.GroupOrderId!.Value));
        }

        parts.Add(db.Orders.Where(o => o.GroupOrderId != null && o.TrackingNumber.StartsWith(term)).Select(o => o.GroupOrderId!.Value));

        return UnionAll(parts);
    }

    /// <summary>Ids of standalone orders (no batch) whose recipient fields, owning customer's fields, or tracking number start with <paramref name="term"/>.</summary>
    public static IQueryable<Guid> MatchingStandaloneIds(
        IAppDbContext db, string term, bool matchesSender, bool matchesRecipient)
    {
        List<IQueryable<Guid>> parts = new();

        if (matchesRecipient)
        {
            parts.Add(db.Orders.Where(o => o.GroupOrderId == null && o.RecipientName.StartsWith(term)).Select(o => o.Id));
            parts.Add(db.Orders.Where(o => o.GroupOrderId == null && o.RecipientPhone.StartsWith(term)).Select(o => o.Id));
            parts.Add(db.Orders.Where(o => o.GroupOrderId == null && o.RecipientCity.StartsWith(term)).Select(o => o.Id));
            parts.Add(db.Orders.Where(o => o.GroupOrderId == null && o.RecipientDistrict.StartsWith(term)).Select(o => o.Id));
            parts.Add(db.Orders.Where(o => o.GroupOrderId == null && o.RecipientAddress.StartsWith(term)).Select(o => o.Id));
        }

        if (matchesSender)
        {
            // Seek the (small, fully indexed) Customers table per column, then pick their
            // standalone orders by CustomerId.
            List<IQueryable<Guid>> customerParts = new();
            foreach (string variant in BusinessNameSearch.Variants(term))
                customerParts.Add(db.Customers.Where(c => c.BusinessName.StartsWith(variant)).Select(c => c.Id));
            customerParts.Add(db.Customers.Where(c => c.FirstName.StartsWith(term)).Select(c => c.Id));
            customerParts.Add(db.Customers.Where(c => c.LastName.StartsWith(term)).Select(c => c.Id));
            customerParts.Add(db.Customers.Where(c => c.PhoneNumber.StartsWith(term)).Select(c => c.Id));
            customerParts.Add(db.Customers.Where(c => c.City.StartsWith(term)).Select(c => c.Id));
            customerParts.Add(db.Customers.Where(c => c.District.StartsWith(term)).Select(c => c.Id));
            customerParts.Add(db.Customers.Where(c => c.Address.StartsWith(term)).Select(c => c.Id));
            IQueryable<Guid> customerIds = UnionAll(customerParts);

            parts.Add(db.Orders
                .Where(o => o.GroupOrderId == null && o.CustomerId != null && customerIds.Contains(o.CustomerId.Value))
                .Select(o => o.Id));
        }

        parts.Add(db.Orders.Where(o => o.GroupOrderId == null && o.TrackingNumber.StartsWith(term)).Select(o => o.Id));

        return UnionAll(parts);
    }

    // UNION ALL, not UNION: the result only feeds an IN (…), so duplicates are harmless and
    // skipping the de-dup sort keeps each branch a plain seek.
    private static IQueryable<Guid> UnionAll(List<IQueryable<Guid>> parts) =>
        parts.Aggregate((acc, next) => acc.Concat(next));
}
