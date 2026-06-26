using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerSettlements;
using Application.GroupOrders.Commands.Shared;
using Application.GroupOrders.DTOs;
using Domain;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.AttachOrdersToGroupOrder;

public sealed class AttachOrdersToGroupOrderCommandHandler
    : IRequestHandler<AttachOrdersToGroupOrderCommand, CreateGroupOrderResultDto>
{
    private static readonly OrderStatus[] CancelledStatuses =
    {
        OrderStatus.CancelledByAdmin,
        OrderStatus.CancelledBySender,
        OrderStatus.OrderNotAccepted,
    };

    private readonly IAppDbContext _context;
    private readonly IRealtimeNotifier _notifier;

    public AttachOrdersToGroupOrderCommandHandler(IAppDbContext context, IRealtimeNotifier notifier)
    {
        _context  = context;
        _notifier = notifier;
    }

    public async Task<CreateGroupOrderResultDto> Handle(
        AttachOrdersToGroupOrderCommand request,
        CancellationToken cancellationToken)
    {
        // Only the customer's own unattached, non-cancelled orders from the chosen set.
        var orders = await _context.Orders
            .Where(o => request.OrderIds.Contains(o.Id)
                     && o.CustomerId == request.CustomerId
                     && o.GroupOrderId == null
                     && !CancelledStatuses.Contains(o.Status))
            .ToListAsync(cancellationToken);

        if (orders.Count == 0)
            throw new ConflictException("None of the selected orders can be grouped (already grouped or cancelled).");

        var date = request.Date.Date;

        GroupOrder? groupOrder;

        if (request.TargetGroupOrderId is Guid targetId)
        {
            // Admin chose an explicit batch to append to.
            groupOrder = await _context.GroupOrders
                .Include(g => g.Orders)
                .FirstOrDefaultAsync(g => g.Id == targetId, cancellationToken)
                ?? throw new NotFoundException("GroupOrder", targetId);

            if (groupOrder.CustomerId != request.CustomerId)
                throw new ConflictException("The chosen batch belongs to a different customer.");
            if (!GroupOrderAppendPolicy.Appendable.Contains(groupOrder.Status))
                throw new ConflictException("The chosen batch has already been picked up.");
        }
        else if (request.ForceNewBatch)
        {
            // Admin explicitly chose "new batch": skip reuse so a fresh one is created below.
            groupOrder = null;
        }
        else
        {
            // Reuse an open same-day batch for this customer if one exists.
            var batch = await _context.GroupOrders
                .Include(g => g.Orders)
                .Where(g => g.CustomerId == request.CustomerId && g.CreatedAt.Date == date)
                .OrderBy(g => g.CreatedAt)
                .ToListAsync(cancellationToken);

            groupOrder = batch.FirstOrDefault(g => GroupOrderAppendPolicy.Appendable.Contains(g.Status));
        }

        if (groupOrder is null)
        {
            var customer = await _context.Customers
                .FirstOrDefaultAsync(c => c.Id == request.CustomerId, cancellationToken)
                ?? throw new NotFoundException("Customer", request.CustomerId);

            groupOrder = new GroupOrder
            {
                CustomerId         = customer.Id,
                SenderFirstName    = customer.FirstName,
                SenderLastName     = customer.LastName,
                SenderIdNumber     = customer.IdNumber,
                SenderBusinessName = customer.BusinessName,
                SenderPhone        = customer.PhoneNumber,
                PickUpCity         = customer.City,
                PickUpDistrict     = customer.District,
                PickUpAddress      = customer.Address,
                NumberOfPackages   = 0,
                // Sit the batch on the chosen day so it lists under that date's pickups.
                CreatedAt          = orders.Min(o => o.CreatedAt),
            };
            _context.GroupOrders.Add(groupOrder);
        }

        // Order ids whose standalone Return invoice must be retired once grouped — the
        // batch invoice will cover them from now on.
        var movedOrderIds = orders.Select(o => o.Id).ToList();

        foreach (var order in orders)
        {
            order.GroupOrderId = groupOrder.Id;
            order.CustomerId   = null; // batch now owns the customer link
        }

        groupOrder.NumberOfPackages += orders.Count;

        await _context.SaveChangesAsync(cancellationToken);

        _notifier.NotifyAdminsOrdersChanged();

        return new CreateGroupOrderResultDto(
            GroupOrderId:       groupOrder.Id,
            SenderBusinessName: groupOrder.SenderBusinessName,
            Orders: orders
                .Select(o => new CreatedOrderDto(o.Id, o.TrackingNumber, o.RecipientName))
                .ToList());
    }
}
