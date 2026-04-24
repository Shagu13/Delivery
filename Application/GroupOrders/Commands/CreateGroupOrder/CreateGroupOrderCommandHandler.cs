using Application.Common.Interfaces;
using Application.GroupOrders.DTOs;
using Domain;
using MediatR;

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

        var trackingNumbers = await _trackingGen.GenerateManyAsync(dto.Orders.Count, cancellationToken);

        var groupOrder = new GroupOrder
        {
            CustomerId         = dto.CustomerId,   // ← link to customer if logged in
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
            groupOrder.Orders.Add(new Order
            {
                RecipientFirstName = o.RecipientFirstName,
                RecipientLastName  = o.RecipientLastName,
                RecipientPhone     = o.RecipientPhone,
                RecipientCity      = o.RecipientCity,
                RecipientDistrict  = o.RecipientDistrict,
                RecipientAddress   = o.RecipientAddress,
                Description        = o.Description,
                IsPaid             = false,
                TrackingNumber     = trackingNumbers[i]
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
