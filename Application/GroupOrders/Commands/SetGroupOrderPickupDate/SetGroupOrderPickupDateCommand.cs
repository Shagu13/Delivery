using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.SetGroupOrderPickupDate;

public sealed record SetGroupOrderPickupDateCommand(Guid GroupOrderId, DateTime PickupDate) : IRequest;

public sealed class SetGroupOrderPickupDateCommandHandler
    : IRequestHandler<SetGroupOrderPickupDateCommand>
{
    private readonly IAppDbContext _context;
    public SetGroupOrderPickupDateCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(SetGroupOrderPickupDateCommand request, CancellationToken cancellationToken)
    {
        var groupOrder = await _context.GroupOrders
            .FirstOrDefaultAsync(g => g.Id == request.GroupOrderId, cancellationToken)
            ?? throw new NotFoundException("GroupOrder", request.GroupOrderId);

        groupOrder.WhenPackagePickedUpDate = request.PickupDate.ToUniversalTime();
        await _context.SaveChangesAsync(cancellationToken);
    }
}
