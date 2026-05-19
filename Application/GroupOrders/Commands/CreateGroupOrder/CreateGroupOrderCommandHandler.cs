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
        _context = context;
        _trackingGen = trackingGen;
        _adminSms = adminSms;
        _logger = logger;
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
        // when the customer has no negotiated tier price.
        var districtNames = dto.Orders.Select(o => o.RecipientDistrict).Distinct().ToList();
        var districts = await _context.Districts
            .AsNoTracking()
            .Where(d => districtNames.Contains(d.DistrictName))
            .ToListAsync(cancellationToken);

        var trackingNumbers = await _trackingGen.GenerateManyAsync(dto.Orders.Count, cancellationToken);

        var groupOrder = new GroupOrder
        {
            CustomerId = dto.CustomerId,
            SenderFirstName = dto.SenderFirstName,
            SenderLastName = dto.SenderLastName,
            SenderIdNumber = dto.SenderIdNumber,
            SenderBusinessName = dto.SenderBusinessName,
            SenderPhone = dto.SenderPhone,
            PickUpCity = dto.PickUpCity,
            PickUpDistrict = dto.PickUpDistrict,
            PickUpAddress = dto.PickUpAddress,
            Note = dto.Note,
            NumberOfPackages = dto.Orders.Count
        };

        for (int i = 0; i < dto.Orders.Count; i++)
        {
            var o = dto.Orders[i];

            decimal companyServicePrice;

            var district = districts.FirstOrDefault(d =>
                d.DistrictName.Equals(o.RecipientDistrict, StringComparison.OrdinalIgnoreCase));

            if (o.CompanyServicePrice.HasValue && o.CompanyServicePrice.Value > 0)
            {
                companyServicePrice = o.CompanyServicePrice.Value;
            }
            else if (customer is not null)
            {
                bool isCapital = district?.IsCapitalTerritory == true;
                bool isCity = district?.IsCityTerritory == true;

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
                companyServicePrice = district?.CompanyServicePrice ?? 0;
            }

            decimal? amountToCollect = null;
            if (o.ProductPaymentStatus == PaymentStatus.NotPaid &&
                o.AmountToCollectForPackage is > 0)
            {
                amountToCollect = o.AmountToCollectForPackage;
            }

            groupOrder.Orders.Add(new Order
            {
                RecipientFirstName = o.RecipientFirstName,
                RecipientLastName = o.RecipientLastName,
                RecipientPhone = o.RecipientPhone,
                RecipientCity = o.RecipientCity,
                RecipientDistrict = o.RecipientDistrict,
                RecipientAddress = o.RecipientAddress,
                Description = o.Description,
                IsFragile = o.IsFragile,
                ProductPaymentStatus = o.ProductPaymentStatus,
                WhoPaysForCompanyService = o.WhoPaysForCompanyService,
                AmountToCollectForPackage = amountToCollect,
                TrackingNumber = trackingNumbers[i],
                CompanyServicePrice = companyServicePrice
            });
        }

        _context.GroupOrders.Add(groupOrder);
        await _context.SaveChangesAsync(cancellationToken);

        // ── Notify admin via SMS ──────────────────────────────────────────────
        // Order is already saved at this point. If SMS fails it is logged and
        // swallowed — it must never surface as an error to the sender.
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
            GroupOrderId: groupOrder.Id,
            SenderBusinessName: groupOrder.SenderBusinessName,
            Orders: groupOrder.Orders
                .Select(o => new CreatedOrderDto(o.Id, o.TrackingNumber,
                    o.RecipientFirstName, o.RecipientLastName))
                .ToList()
        );
    }
}