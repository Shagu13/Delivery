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
        _context = context;
        _trackingGen = trackingGen;
    }

    public async Task<CreateGroupOrderResultDto> Handle(
        CreateGroupOrderCommand request,
        CancellationToken cancellationToken)
    {
        var dto = request.Dto;

        // Generate all tracking numbers in one connection round-trip
        var trackingNumbers = await _trackingGen.GenerateManyAsync(dto.Orders.Count, cancellationToken);

        // Build GroupOrder — starts as Pending, no courier assigned yet
        var groupOrder = new GroupOrder
        {
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

        // Each package becomes one Order with its own unique tracking number
        for (int i = 0; i < dto.Orders.Count; i++)
        {
            var orderDto = dto.Orders[i];

            groupOrder.Orders.Add(new Order
            {
                RecipientFirstName = orderDto.RecipientFirstName,
                RecipientLastName = orderDto.RecipientLastName,
                RecipientPhone = orderDto.RecipientPhone,
                RecipientCity = orderDto.RecipientCity,
                RecipientDistrict = orderDto.RecipientDistrict,
                RecipientAddress = orderDto.RecipientAddress,
                Description = orderDto.Description,
                IsPaid = false,
                TrackingNumber = trackingNumbers[i]
            });
        }

        _context.GroupOrders.Add(groupOrder);
        await _context.SaveChangesAsync(cancellationToken);

        // Return GroupOrderId + each package's tracking number to the sender
        return new CreateGroupOrderResultDto(
            GroupOrderId: groupOrder.Id,
            SenderBusinessName: groupOrder.SenderBusinessName,
            Orders: groupOrder.Orders
                .Select(o => new CreatedOrderDto(
                    o.Id,
                    o.TrackingNumber,
                    o.RecipientFirstName,
                    o.RecipientLastName))
                .ToList()
        );
    }
}