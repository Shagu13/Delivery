using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Payments.Commands;

// ── Command ───────────────────────────────────────────────────────────────────

/// <summary>
/// Admin marks that the company has forwarded COD product money to a sender
/// for a batch of orders.
/// Applicable when ProductPaymentStatus == NotPaid (courier collected cash for product).
/// Creates a PaymentRequest of type CompanyPaysSender and sets HasCompanyPaidTheSender = true.
/// </summary>
public sealed record MarkCompanyPaidSenderCommand(
    Guid       CustomerId,
    List<Guid> OrderIds,
    string?    Note
) : IRequest<Guid>;

// ── Validator ─────────────────────────────────────────────────────────────────

public sealed class MarkCompanyPaidSenderCommandValidator
    : AbstractValidator<MarkCompanyPaidSenderCommand>
{
    public MarkCompanyPaidSenderCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.OrderIds).NotEmpty();
        RuleFor(x => x.Note).MaximumLength(500).When(x => x.Note is not null);
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

public sealed class MarkCompanyPaidSenderCommandHandler
    : IRequestHandler<MarkCompanyPaidSenderCommand, Guid>
{
    private readonly IAppDbContext _context;
    public MarkCompanyPaidSenderCommandHandler(IAppDbContext context)
        => _context = context;

    public async Task<Guid> Handle(
        MarkCompanyPaidSenderCommand request,
        CancellationToken cancellationToken)
    {
        var orders = await _context.Orders
            .Include(o => o.GroupOrder)
            .Where(o => request.OrderIds.Contains(o.Id))
            .ToListAsync(cancellationToken);

        if (orders.Count != request.OrderIds.Count)
            throw new NotFoundException("Order", "one or more of the requested IDs");

        // Validate: must belong to customer, product must be NotPaid (COD), not already paid out
        var invalid = orders
            .Where(o => o.GroupOrder.CustomerId != request.CustomerId
                     || o.ProductPaymentStatus   != PaymentStatus.NotPaid
                     || o.HasCompanyPaidTheSender)
            .Select(o => o.TrackingNumber)
            .ToList();

        if (invalid.Count > 0)
            throw new ConflictException(
                $"The following orders are not eligible: {string.Join(", ", invalid)}");

        var total = orders.Sum(o => o.AmountOfCashCollected ?? o.AmountToCollectForPackage ?? 0m);

        var paymentRequest = new PaymentRequest
        {
            Type        = PaymentRequestType.CompanyPaysSender,
            Status      = PaymentRequestStatus.Confirmed, // admin initiates and confirms simultaneously
            CustomerId  = request.CustomerId,
            TotalAmount = total,
            AmountConfirmed = total,
            ConfirmedAt = DateTime.UtcNow,
            Note        = request.Note,
        };

        _context.PaymentRequests.Add(paymentRequest);

        foreach (var order in orders)
            order.HasCompanyPaidTheSender = true;

        await _context.SaveChangesAsync(cancellationToken);
        return paymentRequest.Id;
    }
}
