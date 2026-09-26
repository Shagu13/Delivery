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

        // Editable per-package up until the parcel is handed to a courier for
        // last-mile delivery (CourierAssignedToDeliver onward is locked) — same
        // window as cancel.
        if (!CustomerOrderActionPolicy.EditableOrCancellable.Contains(order.Status))
            throw new ConflictException("This order can no longer be edited.");

        order.RecipientName      = request.RecipientName.Trim();
        order.RecipientPhone     = request.RecipientPhone.Trim();
        order.RecipientAddress   = request.RecipientAddress.Trim();
        order.Description        = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();

        // The customer may correct a mismarked payment status (e.g. picked "Paid" by mistake).
        // Set it first so the payer/COD logic below reacts to the new status, not the old one.
        order.ProductPaymentStatus = request.ProductPaymentStatus;

        // COD (unpaid) parcels always bill the fee to the recipient at delivery — same rule
        // as the create-order form (handlePaymentStatusChange) — so the choice only applies
        // to already-paid parcels.
        order.WhoPaysForCompanyService = order.ProductPaymentStatus == PaymentStatus.NotPaid
            ? ServicePayer.Recipient
            : request.WhoPaysForCompanyService;

        // COD only applies to unpaid parcels; ignore any value for already-paid products.
        if (order.ProductPaymentStatus != PaymentStatus.NotPaid)
        {
            order.AmountToCollectForPackage = null;
        }
        // For "service included" orders the customer enters the all-in price; subtract the
        // (admin-resolved, immutable here) service fee so only the product portion is stored.
        else if (order.IsCompanyServicePriceIncluded && request.AmountToCollectForPackage is decimal gross)
        {
            if (gross < order.CompanyServicePrice)
            {
                throw new Application.Common.Exceptions.ValidationException(new[]
                {
                    new FluentValidation.Results.ValidationFailure(
                        nameof(request.AmountToCollectForPackage),
                        $"The all-in price ({gross:0.##}) is less than the service fee ({order.CompanyServicePrice:0.##}).")
                });
            }
            order.AmountToCollectForPackage = gross - order.CompanyServicePrice;
        }
        else
        {
            order.AmountToCollectForPackage = request.AmountToCollectForPackage;
        }

        await _context.SaveChangesAsync(cancellationToken);
    }
}
