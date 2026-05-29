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
/// Customer submits a payment request for a batch of orders.
/// Each selected order must belong to this customer, be WhoPaysForCompanyService == Sender,
/// and currently be CompanyServicePaymentStatus == Unpaid.
/// Creates a PaymentRequest record and flips orders to Pending.
/// </summary>
public sealed record CreateSenderPaymentRequestCommand(
    /// <summary>The authenticated customer's domain ID.</summary>
    Guid       CustomerId,
    /// <summary>Order IDs the customer is paying for.</summary>
    List<Guid> OrderIds,
    string?    Note
) : IRequest<Guid>;

// ── Validator ─────────────────────────────────────────────────────────────────

public sealed class CreateSenderPaymentRequestCommandValidator
    : AbstractValidator<CreateSenderPaymentRequestCommand>
{
    public CreateSenderPaymentRequestCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.OrderIds)
            .NotEmpty().WithMessage("At least one order must be selected.")
            .Must(ids => ids.Count <= 200).WithMessage("Cannot submit more than 200 orders at once.");
        RuleFor(x => x.Note).MaximumLength(500).When(x => x.Note is not null);
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

public sealed class CreateSenderPaymentRequestCommandHandler
    : IRequestHandler<CreateSenderPaymentRequestCommand, Guid>
{
    private readonly IAppDbContext _context;
    public CreateSenderPaymentRequestCommandHandler(IAppDbContext context)
        => _context = context;

    public async Task<Guid> Handle(
        CreateSenderPaymentRequestCommand request,
        CancellationToken cancellationToken)
    {
        // ── 1. Load orders and validate ownership ─────────────────────────────
        var orders = await _context.Orders
            .Include(o => o.GroupOrder)
            .Where(o => request.OrderIds.Contains(o.Id))
            .ToListAsync(cancellationToken);

        if (orders.Count != request.OrderIds.Count)
            throw new NotFoundException("Order", "one or more of the requested IDs");

        var invalid = orders
            .Where(o => o.GroupOrder.CustomerId != request.CustomerId)
            .Select(o => o.TrackingNumber)
            .ToList();

        if (invalid.Count > 0)
            throw new ForbiddenException(
                $"Orders do not belong to this customer: {string.Join(", ", invalid)}");

        // ── 2. Validate eligibility ────────────────────────────────────────────
        var notEligible = orders
            .Where(o => o.WhoPaysForCompanyService != ServicePayer.Sender
                     || o.CompanyServicePaymentStatus != CompanyServicePaymentStatus.Unpaid)
            .Select(o => o.TrackingNumber)
            .ToList();

        if (notEligible.Count > 0)
            throw new ConflictException(
                $"The following orders are not eligible for payment (already paid or recipient pays): " +
                string.Join(", ", notEligible));

        // ── 3. Calculate total ────────────────────────────────────────────────
        var total = orders.Sum(o => o.CompanyServicePrice);

        // ── 4. Create PaymentRequest ──────────────────────────────────────────
        var paymentRequest = new PaymentRequest
        {
            Type        = PaymentRequestType.SenderPaysCompany,
            Status      = PaymentRequestStatus.Pending,
            CustomerId  = request.CustomerId,
            TotalAmount = total,
            Note        = request.Note,
        };

        _context.PaymentRequests.Add(paymentRequest);

        // ── 5. Link orders and flip status to Pending ─────────────────────────
        foreach (var order in orders)
        {
            order.PaymentRequestId             = paymentRequest.Id;
            order.CompanyServicePaymentStatus  = CompanyServicePaymentStatus.Pending;
        }

        await _context.SaveChangesAsync(cancellationToken);
        return paymentRequest.Id;
    }
}
