using Application.Common.Interfaces;
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
            NumberOfPackages   = dto.Orders.Count
        };

        for (int i = 0; i < dto.Orders.Count; i++)
        {
            var o = dto.Orders[i];

            decimal companyServicePrice;

            // ── Step 1: explicit override from sender/admin ───────────────────
            if (o.CompanyServicePrice.HasValue && o.CompanyServicePrice.Value > 0)
            {
                companyServicePrice = o.CompanyServicePrice.Value;
            }
            // ── Step 2: weight tier with IsStandard = false ───────────────────
            else if (o.WeightPriceTierId.HasValue
                && weightTiers.FirstOrDefault(t => t.Id == o.WeightPriceTierId.Value) is { IsStandard: false } customTier
                && customTier.CustomPrice is > 0)
            {
                companyServicePrice = customTier.CustomPrice!.Value;
            }
            // ── Step 3: standard pricing (customer negotiated → district fallback)
            else
            {
                var district = districts.FirstOrDefault(d =>
                    d.DistrictName.Equals(o.RecipientDistrict, StringComparison.OrdinalIgnoreCase));

                if (customer is not null)
                {
                    bool isCapital = district?.IsCapitalTerritory == true;
                    bool isCity    = district?.IsCityTerritory    == true;

                    if (isCapital && customer.CompanyServiceCapitalPrice is > 0)
                        companyServicePrice = customer.CompanyServiceCapitalPrice!.Value;
                    else if (isCity && customer.CompanyServiceCityPrice is > 0)
                        companyServicePrice = customer.CompanyServiceCityPrice!.Value;
                    else if (customer.CompanyServiceDistrictPrice is > 0)
                        companyServicePrice = customer.CompanyServiceDistrictPrice!.Value;
                    else
                        companyServicePrice = district?.CompanyServicePrice ?? 0;
                }
                else
                {
                    companyServicePrice = districts
                        .FirstOrDefault(d => d.DistrictName.Equals(
                            o.RecipientDistrict, StringComparison.OrdinalIgnoreCase))
                        ?.CompanyServicePrice ?? 0;
                }
            }

            decimal? amountToCollect = null;
            if (o.ProductPaymentStatus == PaymentStatus.NotPaid &&
                o.AmountToCollectForPackage is > 0)
            {
                amountToCollect = o.AmountToCollectForPackage;
            }

            groupOrder.Orders.Add(new Order
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
            });
        }

        _context.GroupOrders.Add(groupOrder);
        await _context.SaveChangesAsync(cancellationToken);

        // ── Notify admin via SMS ──────────────────────────────────────────────
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

        return new CreateGroupOrderResultDto(
            GroupOrderId:       groupOrder.Id,
            SenderBusinessName: groupOrder.SenderBusinessName,
            Orders: groupOrder.Orders
                .Select(o => new CreatedOrderDto(o.Id, o.TrackingNumber,
                    o.RecipientFirstName, o.RecipientLastName))
                .ToList()
        );
    }
}
