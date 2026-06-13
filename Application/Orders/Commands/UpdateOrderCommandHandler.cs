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

        // ── Financials ───────────────────────────────────────────────────────
        order.CompanyServicePrice            = request.CompanyServicePrice;
        order.IsCompanyServicePriceIncluded  = request.IsCompanyServicePriceIncluded;

        // When the service fee is bundled into the entered price, the supplied COD is the
        // all-in amount: subtract the fee so only the product portion is stored. Block
        // rather than record a negative product price.
        if (request.IsCompanyServicePriceIncluded && request.AmountToCollectForPackage is decimal gross)
        {
            if (gross < request.CompanyServicePrice)
            {
                throw new Application.Common.Exceptions.ValidationException(new[]
                {
                    new FluentValidation.Results.ValidationFailure(
                        nameof(request.AmountToCollectForPackage),
                        $"The all-in price ({gross:0.##}) is less than the service fee ({request.CompanyServicePrice:0.##}).")
                });
            }
            order.AmountToCollectForPackage = gross - request.CompanyServicePrice;
        }
        else
        {
            order.AmountToCollectForPackage = request.AmountToCollectForPackage;
        }

        order.CourierSalary       = request.CourierSalary;

        // Auto-recalculate company revenue when both values are set
        order.CompanyRevenue = request.CourierSalary.HasValue
            ? request.CompanyServicePrice - request.CourierSalary.Value
            : null;

        // For an already-delivered order, the physical cash the courier collected is
        // derived from the (now edited) service price / package COD. Re-derive it so the
        // courier settlement's cash totals stay correct. Covers Send/Exchange deliveries
        // (DeliveredToRecipient, ExchangeCompleted) and return drop-offs
        // (DeliveredReturnOrderToWarehouse, ReturnedToSender). Mirrors the cash formula in
        // the delivery handlers:
        //   Recipient pays fee → package COD (if any) + service fee.
        //   Sender pays fee    → package COD only (returns carry none → no cash).
        var isDelivered = order.Status is OrderStatus.DeliveredToRecipient
                                       or OrderStatus.ExchangeCompleted
                                       or OrderStatus.DeliveredReturnOrderToWarehouse
                                       or OrderStatus.ReturnedToSender;
        if (isDelivered)
        {
            order.AmountOfCashCollected = order.WhoPaysForCompanyService == ServicePayer.Recipient
                ? (order.AmountToCollectForPackage ?? 0m) + order.CompanyServicePrice
                : order.AmountToCollectForPackage;
        }

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

        // ── Keep settlements in sync with the edited financials ───────────────
        // The edited COD / sender-paid service / status feed the customer's per-batch
        // invoice; a delivered order also feeds the courier daily settlement (cash,
        // salary, revenue). Refresh both so the admin Finance page reconciles.
        await CustomerSettlements.CustomerSettlementService.UpsertForOrderAsync(_context, order, cancellationToken);

        // Return orders are attributed to the courier's warehouse drop-off day; for
        // those, DeliveredAt is the admin's ReturnedToSender timestamp and must not
        // drive the recompute. Send/Exchange use DeliveredAt (the courier delivery).
        var settlementDate = order.OrderType == OrderType.Return
            ? order.DeliveredToWarehouseAt ?? order.DeliveredAt
            : order.DeliveredAt ?? order.DeliveredToWarehouseAt;
        if (order.CourierId.HasValue && settlementDate.HasValue)
            await Settlements.CourierSettlementService.RecomputeForDayAsync(
                _context, order.CourierId.Value, settlementDate.Value, cancellationToken);
    }
}
