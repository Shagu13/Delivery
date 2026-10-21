using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Finance;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Commands;

public sealed class SetOrderPricesCommandHandler : IRequestHandler<SetOrderPricesCommand>
{
    private readonly IAppDbContext _context;
    public SetOrderPricesCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(SetOrderPricesCommand request, CancellationToken cancellationToken)
    {
        Domain.Order order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        order.CompanyServicePrice       = request.CompanyServicePrice;
        order.AmountToCollectForPackage = request.AmountToCollectForPackage;

        if (order.CourierSalary.HasValue)
            order.CompanyRevenue = order.CompanyServicePrice - order.CourierSalary.Value;

        bool isDelivered = order.Status is OrderStatus.DeliveredToRecipient
                                        or OrderStatus.ExchangeCompleted
                                        or OrderStatus.DeliveredReturnOrderToWarehouse
                                        or OrderStatus.ReturnedToSender;
        if (!isDelivered)
        {
            // Before delivery the edited COD is still the original price.
            order.OriginalPackagePrice = order.AmountToCollectForPackage;
        }
        else if (!OrderFinance.IsBillableFailedDelivery(order))
        {
            // Delivered: re-derive the recorded cash from the admin's new values, so the courier
            // settlement shows any difference between the new total and what was physically handed over.
            order.AmountOfCashCollected = OrderFinance.DeliveredCashCollected(order);
        }

        await _context.SaveChangesAsync(cancellationToken);
    }
}
