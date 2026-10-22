using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Settlements;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Commands.ChangeOrderPayer;

public sealed class ChangeOrderPayerCommandHandler : IRequestHandler<ChangeOrderPayerCommand>
{
    private readonly IAppDbContext _context;
    public ChangeOrderPayerCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(ChangeOrderPayerCommand request, CancellationToken cancellationToken)
    {
        Order order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        PayerChangeComputation result = OrderPayerChangePolicy.Apply(order, request.NewPayer, request.CompanyServicePrice);

        // Receipts are history of payments that no longer hold — trim them with the order, in one save.
        await PaymentReceiptTrimmer.TrimAsync(_context, order.Id, result.ReceiptTrims, cancellationToken);

        await _context.SaveChangesAsync(cancellationToken);
    }
}
