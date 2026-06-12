using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerSettlements;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Commands;

public sealed class UpdateOrderByCustomerCommandHandler : IRequestHandler<UpdateOrderByCustomerCommand>
{
    private readonly IAppDbContext _context;
    public UpdateOrderByCustomerCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(UpdateOrderByCustomerCommand request, CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .Include(o => o.GroupOrder)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        // Customers may only edit Send/Exchange packages inside their own group order.
        // Standalone Return orders (GroupOrderId == null) are out of scope.
        if (order.GroupOrder is null || order.GroupOrder.CustomerId != request.CustomerId)
            throw new ForbiddenException("You can only edit your own orders.");

        // Editable only before the company accepts the batch — same window as cancel.
        if (order.GroupOrder.Status != OrderStatus.Pending)
            throw new ConflictException("This order can no longer be edited.");

        order.RecipientFirstName = request.RecipientFirstName.Trim();
        order.RecipientLastName  = request.RecipientLastName.Trim();
        order.RecipientPhone     = request.RecipientPhone.Trim();
        order.RecipientAddress   = request.RecipientAddress.Trim();

        // COD only applies to unpaid parcels; ignore any value for already-paid products.
        order.AmountToCollectForPackage = order.ProductPaymentStatus == PaymentStatus.NotPaid
            ? request.AmountToCollectForPackage
            : null;

        await _context.SaveChangesAsync(cancellationToken);

        // The edited COD feeds the customer's per-batch invoice — keep it in sync.
        await CustomerSettlementService.UpsertForGroupOrderAsync(
            _context, order.GroupOrderId!.Value, cancellationToken);
    }
}
