using Application.Common.Interfaces;
using Application.CustomerSettlements;
using Application.GroupOrders.DTOs;
using Domain;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Application.GroupOrders.Commands.CreateGroupOrder;

public sealed class CreateGroupOrderCommandHandler
    : IRequestHandler<CreateGroupOrderCommand, CreateGroupOrderResultDto>
{
    private readonly IAppDbContext _context;
    private readonly ITrackingNumberGenerator _trackingGen;
    private readonly IAdminNotificationSmsService _adminSms;
    private readonly ILogger<CreateGroupOrderCommandHandler> _logger;

    public CreateGroupOrderCommandHandler(
        IAppDbContext context,
        ITrackingNumberGenerator trackingGen,
        IAdminNotificationSmsService adminSms,
        ILogger<CreateGroupOrderCommandHandler> logger)
    {
        _context     = context;
        _trackingGen = trackingGen;
        _adminSms    = adminSms;
        _logger      = logger;
    }

    public async Task<CreateGroupOrderResultDto> Handle(
        CreateGroupOrderCommand request,
        CancellationToken cancellationToken)
    {
        var dto = request.Dto;

        // Load customer to check negotiated price tiers
        var customer = dto.CustomerId.HasValue
            ? await _context.Customers
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == dto.CustomerId.Value, cancellationToken)
            : null;

        // Load the districts referenced by orders so we can fall back to their default price
        var districtNames = dto.Orders.Select(o => o.RecipientDistrict).Distinct().ToList();
        var districts = await _context.Districts
            .AsNoTracking()
            .Where(d => districtNames.Contains(d.DistrictName))
            .ToListAsync(cancellationToken);

        // Load all weight price tiers referenced by orders (bulk — avoids N+1)
        var tierIds = dto.Orders
            .Select(o => o.WeightPriceTierId)
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .Distinct()
            .ToList();

        var weightTiers = tierIds.Count > 0
            ? await _context.WeightPriceTiers
                .AsNoTracking()
                .Where(t => tierIds.Contains(t.Id) && t.DateDeleted == null)
                .ToListAsync(cancellationToken)
            : new List<WeightPriceTier>();

        var trackingNumbers = await _trackingGen.GenerateManyAsync(dto.Orders.Count, cancellationToken);

        // ── Split: Return orders become standalone; Send/Exchange go into GroupOrder ──
        var standaloneReturns = new List<Order>();

        var groupOrder = new GroupOrder
        {
            CustomerId         = dto.CustomerId,
            SenderFirstName    = dto.SenderFirstName,
            SenderLastName     = dto.SenderLastName,
            SenderIdNumber     = dto.SenderIdNumber,
            SenderBusinessName = dto.SenderBusinessName,
            SenderPhone        = dto.SenderPhone,
            PickUpCity         = dto.PickUpCity,
            PickUpDistrict     = dto.PickUpDistrict,
            PickUpAddress      = dto.PickUpAddress,
            Note               = dto.Note,
            NumberOfPackages   = dto.Orders.Count(o => o.OrderType != OrderType.Return)
        };

        for (int i = 0; i < dto.Orders.Count; i++)
        {
            var o = dto.Orders[i];

            // For Return orders the fee is based on the return pickup district (where courier collects)
            var districtName = o.OrderType == OrderType.Return
                ? (o.ReturnPickupDistrict ?? o.RecipientDistrict)
                : o.RecipientDistrict;

            var district = districts.FirstOrDefault(d =>
                d.DistrictName.Equals(districtName, StringComparison.OrdinalIgnoreCase));

            bool isCapital = district?.IsCapitalTerritory == true;
            bool isCity    = district?.IsCityTerritory    == true;

            decimal companyServicePrice;

            // ── Step 1: explicit override from sender/admin ───────────────────
            if (o.CompanyServicePrice.HasValue && o.CompanyServicePrice.Value > 0)
            {
                companyServicePrice = o.CompanyServicePrice.Value;
            }
            // ── Step 2: weight tier zone price ────────────────────────────────
            else if (o.WeightPriceTierId.HasValue
                && weightTiers.FirstOrDefault(t => t.Id == o.WeightPriceTierId.Value) is { } tier)
            {
                decimal? zonePrice = isCapital ? tier.CapitalPrice
                                   : isCity    ? tier.CityPrice
                                               : tier.DistrictPrice;

                if (zonePrice is > 0)
                {
                    companyServicePrice = zonePrice.Value;
                }
                else
                {
                    companyServicePrice = ResolveStandardPrice(customer, district, isCapital, isCity);
                }
            }
            // ── Step 3: standard pricing (customer negotiated → district fallback)
            else
            {
                companyServicePrice = ResolveStandardPrice(customer, district, isCapital, isCity);
            }

            decimal? amountToCollect = null;
            if (o.ProductPaymentStatus == PaymentStatus.NotPaid &&
                o.AmountToCollectForPackage is > 0)
            {
                amountToCollect = o.AmountToCollectForPackage;
            }

            var order = new Order
            {
                RecipientFirstName        = o.RecipientFirstName,
                RecipientLastName         = o.RecipientLastName,
                RecipientPhone            = o.RecipientPhone,
                RecipientCity             = o.RecipientCity,
                RecipientDistrict         = o.RecipientDistrict,
                RecipientAddress          = o.RecipientAddress,
                Description               = o.Description,
                IsFragile                 = o.IsFragile,
                ProductPaymentStatus      = o.ProductPaymentStatus,
                WhoPaysForCompanyService  = o.WhoPaysForCompanyService,
                AmountToCollectForPackage = amountToCollect,
                TrackingNumber            = trackingNumbers[i],
                CompanyServicePrice       = companyServicePrice,
                WeightPriceTierId         = o.WeightPriceTierId,
                OrderType                 = o.OrderType,
                ReturnPickupAddress       = o.OrderType == OrderType.Return ? o.ReturnPickupAddress  : null,
                ReturnPickupCity          = o.OrderType == OrderType.Return ? o.ReturnPickupCity     : null,
                ReturnPickupDistrict      = o.OrderType == OrderType.Return ? o.ReturnPickupDistrict : null,
            };

            if (o.OrderType == OrderType.Return)
            {
                // Standalone — not part of the GroupOrder pickup flow
                order.CustomerId = dto.CustomerId!.Value;
                standaloneReturns.Add(order);
                _context.Orders.Add(order);
            }
            else
            {
                groupOrder.Orders.Add(order);
            }
        }

        if (groupOrder.Orders.Count > 0)
            _context.GroupOrders.Add(groupOrder);

        await _context.SaveChangesAsync(cancellationToken);

        // ── Create per-batch customer invoices ────────────────────────────────
        // Send/Exchange batch → one invoice (when placed by a logged-in customer).
        // Each standalone Return → its own invoice, but only when the sender pays the
        // service fee (handled inside the service).
        if (groupOrder.Orders.Count > 0 && groupOrder.CustomerId.HasValue)
            await CustomerSettlementService.UpsertForGroupOrderAsync(_context, groupOrder.Id, cancellationToken);

        foreach (var ret in standaloneReturns)
            await CustomerSettlementService.UpsertForReturnOrderAsync(_context, ret, cancellationToken);

        // ── Notify admin via SMS ──────────────────────────────────────────────
        if (groupOrder.Orders.Count > 0)
        {
            try
            {
                await _adminSms.SendNewGroupOrderNotificationAsync(groupOrder, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Failed to send admin SMS notification for GroupOrder {GroupOrderId}",
                    groupOrder.Id);
            }
        }

        var allOrders = groupOrder.Orders.Concat(standaloneReturns).ToList();

        return new CreateGroupOrderResultDto(
            GroupOrderId:       groupOrder.Id,
            SenderBusinessName: groupOrder.SenderBusinessName,
            Orders: allOrders
                .Select(o => new CreatedOrderDto(o.Id, o.TrackingNumber,
                    o.RecipientFirstName, o.RecipientLastName))
                .ToList()
        );
    }

    private static decimal ResolveStandardPrice(
        Customer? customer,
        District? district,
        bool isCapital,
        bool isCity)
    {
        if (customer is not null)
        {
            if (isCapital && customer.CompanyServiceCapitalPrice is > 0)
                return customer.CompanyServiceCapitalPrice!.Value;

            if (isCity && customer.CompanyServiceCityPrice is > 0)
                return customer.CompanyServiceCityPrice!.Value;

            if (customer.CompanyServiceDistrictPrice is > 0)
                return customer.CompanyServiceDistrictPrice!.Value;
        }

        return district?.CompanyServicePrice ?? 0;
    }
}
