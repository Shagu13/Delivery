using Application.Common.Interfaces;
using Application.GroupOrders.DTOs;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.CreateGroupOrder;

public sealed class CreateGroupOrderCommandHandler
    : IRequestHandler<CreateGroupOrderCommand, CreateGroupOrderResultDto>
{
    private readonly IAppDbContext _context;
    private readonly ITrackingNumberGenerator _trackingGen;

    public CreateGroupOrderCommandHandler(
        IAppDbContext context,
        ITrackingNumberGenerator trackingGen)
    {
        _context     = context;
        _trackingGen = trackingGen;
    }

    public async Task<CreateGroupOrderResultDto> Handle(
        CreateGroupOrderCommand request,
        CancellationToken cancellationToken)
    {
        var dto = request.Dto;

        // Load customer to check negotiated price
        var customer = dto.CustomerId.HasValue
            ? await _context.Customers
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == dto.CustomerId.Value, cancellationToken)
            : null;

        // Load all districts referenced by the orders (match by name, case-insensitive)
        var districtNames = dto.Orders.Select(o => o.RecipientDistrict).Distinct().ToList();
        var districts = await _context.Districts
            .AsNoTracking()
            .Where(d => districtNames.Contains(d.DistrictName))
            .ToListAsync(cancellationToken);

        var trackingNumbers = await _trackingGen.GenerateManyAsync(dto.Orders.Count, cancellationToken);

        const string tbilisi = "თბილისი";

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

            // Determine CompanyServicePrice for this order
            decimal companyServicePrice = 0;

            // Check if customer has a negotiated price AND recipient city is Tbilisi
            bool isTbilisi = o.RecipientCity.Equals(tbilisi, StringComparison.OrdinalIgnoreCase);
            if (isTbilisi && customer?.CompanyPriceToDeliverPackages.HasValue == true)
            {
                companyServicePrice = customer.CompanyPriceToDeliverPackages.Value;
            }
            else
            {
                var district = districts.FirstOrDefault(d =>
                    d.DistrictName.Equals(o.RecipientDistrict, StringComparison.OrdinalIgnoreCase));
                companyServicePrice = district?.CompanyServicePrice ?? 0;
            }

            groupOrder.Orders.Add(new Order
            {
                RecipientFirstName       = o.RecipientFirstName,
                RecipientLastName        = o.RecipientLastName,
                RecipientPhone           = o.RecipientPhone,
                RecipientCity            = o.RecipientCity,
                RecipientDistrict        = o.RecipientDistrict,
                RecipientAddress         = o.RecipientAddress,
                Description              = o.Description,
                IsFragile                = o.IsFragile,
                ProductPaymentStatus     = o.ProductPaymentStatus,
                WhoPaysForCompanyService = o.WhoPaysForCompanyService,
                TrackingNumber           = trackingNumbers[i],
                CompanyServicePrice      = companyServicePrice
            });
        }

        _context.GroupOrders.Add(groupOrder);
        await _context.SaveChangesAsync(cancellationToken);

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

