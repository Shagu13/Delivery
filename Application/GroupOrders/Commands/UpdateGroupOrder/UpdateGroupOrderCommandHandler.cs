using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.UpdateGroupOrder;

public sealed class UpdateGroupOrderCommandHandler : IRequestHandler<UpdateGroupOrderCommand>
{
    private readonly IAppDbContext _context;
    public UpdateGroupOrderCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(UpdateGroupOrderCommand request, CancellationToken cancellationToken)
    {
        var groupOrder = await _context.GroupOrders
            .FirstOrDefaultAsync(g => g.Id == request.GroupOrderId, cancellationToken)
            ?? throw new NotFoundException("GroupOrder", request.GroupOrderId);

        groupOrder.SenderFirstName    = request.SenderFirstName.Trim();
        groupOrder.SenderLastName     = request.SenderLastName.Trim();
        groupOrder.SenderIdNumber     = string.IsNullOrWhiteSpace(request.SenderIdNumber) ? null : request.SenderIdNumber.Trim();
        groupOrder.SenderBusinessName = request.SenderBusinessName.Trim();
        groupOrder.SenderPhone        = request.SenderPhone.Trim();
        groupOrder.PickUpCity         = request.PickUpCity.Trim();
        groupOrder.PickUpDistrict     = request.PickUpDistrict.Trim();
        groupOrder.PickUpAddress      = request.PickUpAddress.Trim();
        groupOrder.Note               = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();

        await _context.SaveChangesAsync(cancellationToken);
    }
}
