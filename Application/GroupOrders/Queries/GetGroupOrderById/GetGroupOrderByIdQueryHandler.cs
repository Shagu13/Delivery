using Application.Common.Interfaces;
using Application.GroupOrders.DTOs;
using Application.GroupOrders.Queries.GetAllGroupOrders;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Queries.GetGroupOrderById;

public sealed class GetGroupOrderByIdQueryHandler : IRequestHandler<GetGroupOrderByIdQuery, AdminGroupOrderDto?>
{
    private readonly IAppDbContext _context;
    private readonly ICacheService _cache;
    public GetGroupOrderByIdQueryHandler(IAppDbContext context, ICacheService cache)
    {
        _context = context;
        _cache = cache;
    }

    public async Task<AdminGroupOrderDto?> Handle(GetGroupOrderByIdQuery request, CancellationToken cancellationToken)
    {
        var groupOrder = await _context.GroupOrders
            .Include(go => go.Orders)
            .Include(go => go.Courier)
            .Include(go => go.Customer).ThenInclude(c => c!.SpecialPrices).ThenInclude(s => s.District).ThenInclude(d => d.City)
            .AsNoTracking()
            .FirstOrDefaultAsync(go => go.Id == request.Id, cancellationToken);

        var (cityGeo, districtGeo) = await GroupOrderMapping.BuildGeoLookupsAsync(_context, _cache, cancellationToken);

        if (groupOrder is not null)
            return GroupOrderMapping.MapGroupOrder(groupOrder, cityGeo, districtGeo);

        var standalone = await _context.Orders
            .Include(o => o.Customer).ThenInclude(c => c!.SpecialPrices).ThenInclude(s => s.District).ThenInclude(d => d.City)
            .Include(o => o.Courier)
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == request.Id && o.GroupOrderId == null, cancellationToken);

        return standalone is null ? null : GroupOrderMapping.MapStandalone(standalone, cityGeo, districtGeo);
    }
}
