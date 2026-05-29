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
/// Admin marks one of the two financial events on a DailySettlement:
///   - WasCourierPaid = true   → company paid the courier their salary
///   - HasCourierHandedOverRevenue = true → courier handed collected cash to company
/// A PaymentRequest record is created for each event for audit trail.
/// </summary>
public sealed record MarkCourierSettlementPaidCommand(
    Guid DailySettlementId,
    /// <summary>
    /// Which financial event to record.
    /// Must be CompanyPaysCourier or CourierHandsOverRevenue.
    /// </summary>
    PaymentRequestType EventType,
    string? Note
) : IRequest<Guid>;

// ── Validator ─────────────────────────────────────────────────────────────────

public sealed class MarkCourierSettlementPaidCommandValidator
    : AbstractValidator<MarkCourierSettlementPaidCommand>
{
    public MarkCourierSettlementPaidCommandValidator()
    {
        RuleFor(x => x.DailySettlementId).NotEmpty();
        RuleFor(x => x.EventType)
            .Must(t => t == PaymentRequestType.CompanyPaysCourier
                     || t == PaymentRequestType.CourierHandsOverRevenue)
            .WithMessage("EventType must be CompanyPaysCourier or CourierHandsOverRevenue.");
        RuleFor(x => x.Note).MaximumLength(500).When(x => x.Note is not null);
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

public sealed class MarkCourierSettlementPaidCommandHandler
    : IRequestHandler<MarkCourierSettlementPaidCommand, Guid>
{
    private readonly IAppDbContext _context;
    public MarkCourierSettlementPaidCommandHandler(IAppDbContext context)
        => _context = context;

    public async Task<Guid> Handle(
        MarkCourierSettlementPaidCommand request,
        CancellationToken cancellationToken)
    {
        var settlement = await _context.DailySettlements
            .FirstOrDefaultAsync(d => d.Id == request.DailySettlementId, cancellationToken)
            ?? throw new NotFoundException("DailySettlement", request.DailySettlementId);

        decimal amount;

        if (request.EventType == PaymentRequestType.CompanyPaysCourier)
        {
            if (settlement.WasCourierPaid)
                throw new ConflictException("Courier salary for this settlement has already been marked as paid.");

            settlement.WasCourierPaid  = true;
            settlement.CourierPaidAt   = DateTime.UtcNow;
            amount = settlement.TotalCourierSalary;
        }
        else // CourierHandsOverRevenue
        {
            if (settlement.HasCourierHandedOverRevenue)
                throw new ConflictException("Revenue handover for this settlement has already been recorded.");

            settlement.HasCourierHandedOverRevenue = true;
            settlement.RevenueHandedOverAt         = DateTime.UtcNow;
            amount = settlement.TotalCourierTransferToCompany;
        }

        var paymentRequest = new PaymentRequest
        {
            Type              = request.EventType,
            Status            = PaymentRequestStatus.Confirmed,
            CourierId         = settlement.CourierId,
            DailySettlementId = settlement.Id,
            TotalAmount       = amount,
            AmountConfirmed   = amount,
            ConfirmedAt       = DateTime.UtcNow,
            Note              = request.Note,
        };

        _context.PaymentRequests.Add(paymentRequest);
        await _context.SaveChangesAsync(cancellationToken);
        return paymentRequest.Id;
    }
}
