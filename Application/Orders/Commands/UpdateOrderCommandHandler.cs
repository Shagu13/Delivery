using Application.Common.Exceptions;
using Application.Common.Interfaces;
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
        order.WhoPaysForCompanyService = request.WhoPaysForCompanyService;
        order.ProductPaymentStatus     = request.ProductPaymentStatus;
        order.AmountToCollectForPackage = request.AmountToCollectForPackage;

        // ── Financials ───────────────────────────────────────────────────────
        order.CompanyServicePrice = request.CompanyServicePrice;
        order.CourierSalary       = request.CourierSalary;

        // Auto-recalculate company revenue when both values are set
        order.CompanyRevenue = request.CourierSalary.HasValue
            ? request.CompanyServicePrice - request.CourierSalary.Value
            : null;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
