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

        // Load all districts referenced by the orders, including their City so we
        // can determine the pricing tier (Tbilisi / other city / village) via City.CityName.
        var districtNames = dto.Orders.Select(o => o.RecipientDistrict).Distinct().ToList();
        var districts = await _context.Districts
            .AsNoTracking()
            .Include(d => d.City)
            .Where(d => districtNames.Contains(d.DistrictName))
            .ToListAsync(cancellationToken);

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

            // ── Determine CompanyServicePrice for this order ───────────────────
            // Priority 1: explicit per-order override supplied in the request (must be > 0).
            // Priority 2: customer's negotiated tier price, determined by the district's CityName:
            //   Tbilisi tier  → district.CityName == "Tbilisi"
            //   City tier     → district.CityName != "Tbilisi"
            //                   AND district.DistrictName == district.CityName
            //                   (the seeded "city-level" district row for that city)
            //   District tier → district.CityName != "Tbilisi"
            //                   AND district.DistrictName != district.CityName
            //                   (a village / suburb within that city)
            // Priority 3: the recipient district's default service price from the DB.
            decimal companyServicePrice;

            var district = districts.FirstOrDefault(d =>
                d.DistrictName.Equals(o.RecipientDistrict, StringComparison.OrdinalIgnoreCase));

            if (o.CompanyServicePrice.HasValue && o.CompanyServicePrice.Value > 0)
            {
                // Priority 1: explicit override wins.
                companyServicePrice = o.CompanyServicePrice.Value;
            }
            else if (customer is not null && district is not null)
            {
                bool isTbilisi = "Tbilisi".Equals(district.City.CityName, StringComparison.OrdinalIgnoreCase);
                bool isCityLevel = !isTbilisi &&
                    district.DistrictName.Equals(district.City.CityName, StringComparison.OrdinalIgnoreCase);

                if (isTbilisi
                    && customer.CompanyServiceCapitalPrice.HasValue
                    && customer.CompanyServiceCapitalPrice.Value > 0)
                {
                    companyServicePrice = customer.CompanyServiceCapitalPrice.Value;
                }
                else if (isCityLevel
                    && customer.CompanyServiceCityPrice.HasValue
                    && customer.CompanyServiceCityPrice.Value > 0)
                {
                    companyServicePrice = customer.CompanyServiceCityPrice.Value;
                }
                else if (!isTbilisi && !isCityLevel
                    && customer.CompanyServiceDistrictPrice.HasValue
                    && customer.CompanyServiceDistrictPrice.Value > 0)
                {
                    companyServicePrice = customer.CompanyServiceDistrictPrice.Value;
                }
                else
                {
                    // Priority 3: district default.
                    companyServicePrice = district.CompanyServicePrice ?? 0;
                }
            }
            else
            {
                // No customer or district not found — use district default.
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

