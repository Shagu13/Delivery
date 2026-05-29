using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Payments.Commands;

// ── Command ───────────────────────────────────────────────────────────────────

/// <summary>
/// Admin confirms that they have received the payment from the sender.
/// Flips the PaymentRequest status to Confirmed (or PartiallyPaid if partial amount given)
/// and updates CompanyServicePaymentStatus on each linked order to Paid.
/// </summary>
public sealed record ConfirmSenderPaymentCommand(
    Guid    PaymentRequestId,
    /// <summary>
    /// Amount actually received. If equal to TotalAmount → Confirmed.
    /// If less → PartiallyPaid (orders remain Pending until fully confirmed).
    /// </summary>
    decimal AmountReceived,
    string? Note
) : IRequest;

// ── Validator ─────────────────────────────────────────────────────────────────

public sealed class ConfirmSenderPaymentCommandValidator
    : AbstractValidator<ConfirmSenderPaymentCommand>
{
    public ConfirmSenderPaymentCommandValidator()
    {
        RuleFor(x => x.PaymentRequestId).NotEmpty();
        RuleFor(x => x.AmountReceived).GreaterThan(0);
        RuleFor(x => x.Note).MaximumLength(500).When(x => x.Note is not null);
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

public sealed class ConfirmSenderPaymentCommandHandler
    : IRequestHandler<ConfirmSenderPaymentCommand>
{
    private readonly IAppDbContext _context;
    public ConfirmSenderPaymentCommandHandler(IAppDbContext context)
        => _context = context;

    public async Task Handle(
        ConfirmSenderPaymentCommand request,
        CancellationToken cancellationToken)
    {
        var paymentRequest = await _context.PaymentRequests
            .Include(p => p.Orders)
            .FirstOrDefaultAsync(p => p.Id == request.PaymentRequestId, cancellationToken)
            ?? throw new NotFoundException("PaymentRequest", request.PaymentRequestId);

        if (paymentRequest.Type != PaymentRequestType.SenderPaysCompany)
            throw new ConflictException("This endpoint only handles SenderPaysCompany requests.");

        if (paymentRequest.Status == PaymentRequestStatus.Confirmed)
            throw new ConflictException("This payment request is already fully confirmed.");

        // Update confirmed amount
        paymentRequest.AmountConfirmed += request.AmountReceived;
        if (request.Note is not null)
            paymentRequest.Note = request.Note;

        var isFullyPaid = paymentRequest.AmountConfirmed >= paymentRequest.TotalAmount;

        if (isFullyPaid)
        {
            paymentRequest.Status       = PaymentRequestStatus.Confirmed;
            paymentRequest.ConfirmedAt  = DateTime.UtcNow;

            // Flip all linked orders to Paid
            foreach (var order in paymentRequest.Orders)
                order.CompanyServicePaymentStatus = CompanyServicePaymentStatus.Paid;
        }
        else
        {
            paymentRequest.Status = PaymentRequestStatus.PartiallyPaid;
        }

        await _context.SaveChangesAsync(cancellationToken);
    }
}
