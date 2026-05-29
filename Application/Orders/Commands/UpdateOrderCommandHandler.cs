using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Commands;

public sealed class UpdateOrderCommandHandler : IRequestHandler<UpdateOrderCommand>
{
    private readonly IAppDbContext _context;
    public UpdateOrderCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(UpdateOrderCommand request, CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        // ── Recipient / Delivery ─────────────────────────────────────────────
        order.RecipientFirstName = request.RecipientFirstName.Trim();
        order.RecipientLastName  = request.RecipientLastName.Trim();
        order.RecipientPhone     = request.RecipientPhone.Trim();
        order.RecipientCity      = request.RecipientCity.Trim();
        order.RecipientDistrict  = request.RecipientDistrict.Trim();
        order.RecipientAddress   = request.RecipientAddress.Trim();

        // ── Package details ──────────────────────────────────────────────────
        order.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        order.IsFragile   = request.IsFragile;

        // ── Payment ──────────────────────────────────────────────────────────
        order.WhoPaysForCompanyService  = request.WhoPaysForCompanyService;
        order.ProductPaymentStatus      = request.ProductPaymentStatus;
        order.AmountToCollectForPackage = request.AmountToCollectForPackage;

        // ── Financials ───────────────────────────────────────────────────────
        order.CompanyServicePrice = request.CompanyServicePrice;
        order.CourierSalary       = request.CourierSalary;

        // Auto-recalculate company revenue when both values are set
        order.CompanyRevenue = request.CourierSalary.HasValue
            ? request.CompanyServicePrice - request.CourierSalary.Value
            : null;

        // ── Order type & return pickup ────────────────────────────────────────
        order.OrderType = request.OrderType;

        if (request.OrderType == OrderType.Return)
        {
            order.ReturnPickupAddress  = request.ReturnPickupAddress?.Trim();
            order.ReturnPickupCity     = request.ReturnPickupCity?.Trim();
            order.ReturnPickupDistrict = request.ReturnPickupDistrict?.Trim();
        }
        else
        {
            // Clear return fields if type changed away from Return
            order.ReturnPickupAddress  = null;
            order.ReturnPickupCity     = null;
            order.ReturnPickupDistrict = null;
        }

        // ── Status override (admin sets ReturnedToSender / ExchangeCompleted) ──
        if (request.StatusOverride.HasValue)
        {
            // Only allow admin-intended terminal overrides here; normal flow statuses
            // are set by dedicated commands (MarkDelivered, PostponeOrder, etc.)
            var allowed = new[]
            {
                OrderStatus.ReturnedToSender,
                OrderStatus.ExchangeCompleted,
                OrderStatus.CancelledByAdmin,
            };

            if (allowed.Contains(request.StatusOverride.Value))
            {
                order.Status = request.StatusOverride.Value;

                // Stamp DeliveredAt when marking returned/exchanged
                if (request.StatusOverride.Value is OrderStatus.ReturnedToSender
                                                 or OrderStatus.ExchangeCompleted)
                {
                    order.DeliveredAt ??= DateTime.UtcNow;
                }
            }
        }

        await _context.SaveChangesAsync(cancellationToken);
    }
}
