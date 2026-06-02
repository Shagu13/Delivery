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
/// Admin marks that the company has forwarded COD product money to a sender,
/// optionally netting outstanding service fees the sender owes the company.
///
/// Netting rules:
///   - CodOrderIds:        COD orders being paid out (AmountToCollectForPackage)
///   - FeeOffsetOrderIds:  Sender-payer orders whose service fees are deducted
///                         from the COD payout instead of collected separately.
///
/// The net transfer to the sender = sum(COD) - sum(service fees of offset orders).
/// This can never go below zero — if fees >= COD, net = 0 and remaining
/// fee balance stays as a separate obligation (owed by sender to company).
///
/// On confirmation:
///   - All CodOrderIds:       HasCompanyPaidTheSender = true
///   - All FeeOffsetOrderIds: CompanyServicePaymentStatus = Paid
///   - One PaymentRequest created (type CompanyPaysSender) with:
///       TotalAmount      = gross COD
///       ServiceFeeOffset = sum of offset fees
///       AmountConfirmed  = max(0, COD - fees)
/// </summary>
public sealed record MarkCompanyPaidSenderCommand(
    Guid       CustomerId,
    /// <summary>COD orders to mark as paid to sender.</summary>
    List<Guid> CodOrderIds,
    /// <summary>Service-fee orders to offset against the COD (can be empty).</summary>
    List<Guid> FeeOffsetOrderIds,
    string?    Note
) : IRequest<Guid>;

// ── Validator ─────────────────────────────────────────────────────────────────

public sealed class MarkCompanyPaidSenderCommandValidator
    : AbstractValidator<MarkCompanyPaidSenderCommand>
{
    public MarkCompanyPaidSenderCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.CodOrderIds).NotEmpty();
        RuleFor(x => x.FeeOffsetOrderIds).NotNull();
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
        // ── 1. Load and validate COD orders ───────────────────────────────────
        var codOrders = await _context.Orders
            .Include(o => o.GroupOrder)
            .Where(o => request.CodOrderIds.Contains(o.Id))
            .ToListAsync(cancellationToken);

        if (codOrders.Count != request.CodOrderIds.Count)
            throw new NotFoundException("Order", "one or more COD order IDs not found");

        var invalidCod = codOrders
            .Where(o => o.GroupOrder?.CustomerId != request.CustomerId
                     || !(o.AmountToCollectForPackage > 0)
                     || o.HasCompanyPaidTheSender)
            .Select(o => o.TrackingNumber)
            .ToList();

        if (invalidCod.Count > 0)
            throw new ConflictException(
                $"The following COD orders are not eligible: {string.Join(", ", invalidCod)}");

        var grossCod = codOrders.Sum(o => o.AmountToCollectForPackage ?? 0m);

        // ── 2. Load and validate fee-offset orders (if any) ───────────────────
        var feeOffsetOrders = new List<Domain.Order>();

        if (request.FeeOffsetOrderIds.Count > 0)
        {
            feeOffsetOrders = await _context.Orders
                .Include(o => o.GroupOrder)
                .Where(o => request.FeeOffsetOrderIds.Contains(o.Id))
                .ToListAsync(cancellationToken);

            if (feeOffsetOrders.Count != request.FeeOffsetOrderIds.Count)
                throw new NotFoundException("Order", "one or more fee offset order IDs not found");

            var invalidFee = feeOffsetOrders
                .Where(o => o.GroupOrder?.CustomerId    != request.CustomerId
                         || o.WhoPaysForCompanyService != ServicePayer.Sender
                         || o.CompanyServicePaymentStatus == CompanyServicePaymentStatus.Paid)
                .Select(o => o.TrackingNumber)
                .ToList();

            if (invalidFee.Count > 0)
                throw new ConflictException(
                    $"The following fee offset orders are not eligible: {string.Join(", ", invalidFee)}");
        }

        var totalFeeOffset = feeOffsetOrders.Sum(o => o.CompanyServicePrice);

        // ── 3. Calculate net transfer ─────────────────────────────────────────
        // Net can never be negative — if fees exceed COD, net = 0.
        // Remaining fees (fees - COD) stay outstanding as a separate obligation.
        var netTransfer = Math.Max(0m, grossCod - totalFeeOffset);

        // ── 4. Build note including netting breakdown ─────────────────────────
        string? autoNote = null;
        if (totalFeeOffset > 0)
        {
            autoNote = $"COD ₾{grossCod:F2} − service fees ₾{totalFeeOffset:F2} = net ₾{netTransfer:F2}";
            if (request.Note is not null)
                autoNote = $"{autoNote}. {request.Note}";
        }

        // ── 5. Create PaymentRequest ──────────────────────────────────────────
        var paymentRequest = new PaymentRequest
        {
            Type             = PaymentRequestType.CompanyPaysSender,
            Status           = PaymentRequestStatus.Confirmed,
            CustomerId       = request.CustomerId,
            TotalAmount      = grossCod,
            ServiceFeeOffset = totalFeeOffset,
            AmountConfirmed  = netTransfer,
            ConfirmedAt      = DateTime.UtcNow,
            Note             = autoNote ?? request.Note,
        };

        _context.PaymentRequests.Add(paymentRequest);

        // ── 5b. Record the sender's service-fee payment (deducted from COD) ───
        // The sender effectively paid their service fee via COD deduction.
        // The actual amount settled is capped at grossCod (can't deduct more than owed).
        if (totalFeeOffset > 0)
        {
            var effectiveOffset = Math.Min(totalFeeOffset, grossCod);
            var feePaymentNote  = $"Service fee ₾{effectiveOffset:F2} settled via COD deduction";
            if (request.Note is not null)
                feePaymentNote = $"{feePaymentNote}. {request.Note}";

            var feePaymentRequest = new PaymentRequest
            {
                Type            = PaymentRequestType.SenderPaysCompany,
                Status          = PaymentRequestStatus.Confirmed,
                CustomerId      = request.CustomerId,
                TotalAmount     = effectiveOffset,
                AmountConfirmed = effectiveOffset,
                ConfirmedAt     = DateTime.UtcNow,
                Note            = feePaymentNote,
            };

            _context.PaymentRequests.Add(feePaymentRequest);
        }

        // ── 6. Mark COD orders as paid ────────────────────────────────────────
        foreach (var order in codOrders)
            order.HasCompanyPaidTheSender = true;

        // ── 7. Mark offset fee orders as paid ─────────────────────────────────
        foreach (var order in feeOffsetOrders)
            order.CompanyServicePaymentStatus = CompanyServicePaymentStatus.Paid;

        await _context.SaveChangesAsync(cancellationToken);
        return paymentRequest.Id;
    }
}
