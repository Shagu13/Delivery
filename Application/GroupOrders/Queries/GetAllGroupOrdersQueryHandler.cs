//using Application.Common.Interfaces;
//using MediatR;
//using Microsoft.EntityFrameworkCore;

//namespace Application.GroupOrders.Queries.GetAllGroupOrders;

//public sealed class GetAllGroupOrdersQueryHandler
//    : IRequestHandler<GetAllGroupOrdersQuery, IReadOnlyList<AdminGroupOrderDto>>
//{
//    private readonly IAppDbContext _context;

//    public GetAllGroupOrdersQueryHandler(IAppDbContext context)
//    {
//        _context = context;
//    }

//    public async Task<IReadOnlyList<AdminGroupOrderDto>> Handle(
//        GetAllGroupOrdersQuery request,
//        CancellationToken cancellationToken)
//    {
//        var query = _context.GroupOrders
//            .Include(go => go.Orders)
//            .AsNoTracking();

//        // ── Server-side search ───────────────────────────────────────────
//        // Matches against sender info, recipient info, phone numbers, and
//        // tracking numbers so the admin can search by any of those fields.
//        if (!string.IsNullOrWhiteSpace(request.SearchTerm))
//        {
//            var term = request.SearchTerm.Trim().ToLower();

//            query = query.Where(go =>
//                // Sender identity
//                go.SenderFirstName.ToLower().Contains(term) ||
//                go.SenderLastName.ToLower().Contains(term) ||
//                go.SenderBusinessName.ToLower().Contains(term) ||
//                go.SenderPhone.Contains(term) ||
//                // Pickup location
//                go.PickUpCity.ToLower().Contains(term) ||
//                go.PickUpDistrict.ToLower().Contains(term) ||
//                go.PickUpAddress.ToLower().Contains(term) ||
//                // Child orders — recipient identity + location + tracking number
//                go.Orders.Any(o =>
//                    o.RecipientFirstName.ToLower().Contains(term) ||
//                    o.RecipientLastName.ToLower().Contains(term) ||
//                    o.RecipientPhone.Contains(term) ||
//                    o.RecipientCity.ToLower().Contains(term) ||
//                    o.RecipientDistrict.ToLower().Contains(term) ||
//                    o.RecipientAddress.ToLower().Contains(term) ||
//                    o.TrackingNumber.ToLower().Contains(term))
//            );
//        }

//        // ── Sort newest first ────────────────────────────────────────────
//        var groupOrders = await query
//            .OrderByDescending(go => go.CreatedAt)
//            .ToListAsync(cancellationToken);

//        return groupOrders.Select(go => new AdminGroupOrderDto(
//            Id: go.Id,
//            CreatedAt: go.CreatedAt,
//            Status: go.Status,
//            SenderFirstName: go.SenderFirstName,
//            SenderLastName: go.SenderLastName,
//            SenderIdNumber: go.SenderIdNumber,
//            SenderBusinessName: go.SenderBusinessName,
//            SenderPhone: go.SenderPhone,
//            PickUpCity: go.PickUpCity,
//            PickUpDistrict: go.PickUpDistrict,
//            PickUpAddress: go.PickUpAddress,
//            Note: go.Note,
//            NumberOfPackages: go.NumberOfPackages,
//            Orders: go.Orders
//                .OrderBy(o => o.CreatedAt)
//                .Select(o => new AdminOrderDto(
//                    Id: o.Id,
//                    TrackingNumber: o.TrackingNumber,
//                    RecipientFirstName: o.RecipientFirstName,
//                    RecipientLastName: o.RecipientLastName,
//                    RecipientPhone: o.RecipientPhone,
//                    RecipientCity: o.RecipientCity,
//                    RecipientDistrict: o.RecipientDistrict,
//                    RecipientAddress: o.RecipientAddress,
//                    Description: o.Description,
//                    Status: o.Status,
//                    IsPaid: o.IsPaid,
//                    CreatedAt: o.CreatedAt))
//                .ToList()
//        )).ToList();
//    }
//}
