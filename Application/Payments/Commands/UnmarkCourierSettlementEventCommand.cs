using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Payments.Commands;

public sealed record UnmarkCourierSettlementEventCommand(
    Guid DailySettlementId,
    PaymentRequestType EventType
) : IRequest;

public sealed class UnmarkCourierSettlementEventCommandValidator
    : AbstractValidator<UnmarkCourierSettlementEventCommand>
{
    public UnmarkCourierSettlementEventCommandValidator()
    {
        RuleFor(x => x.DailySettlementId).NotEmpty();
        RuleFor(x => x.EventType)
            .Must(t => t == PaymentRequestType.CompanyPaysCourier
                     || t == PaymentRequestType.CourierHandsOverRevenue)
            .WithMessage("EventType must be CompanyPaysCourier or CourierHandsOverRevenue.");
    }
}

public sealed class UnmarkCourierSettlementEventCommandHandler
    : IRequestHandler<UnmarkCourierSettlementEventCommand>
{
    private readonly IAppDbContext _context;
    public UnmarkCourierSettlementEventCommandHandler(IAppDbContext context)
        => _context = context;

    public async Task Handle(
        UnmarkCourierSettlementEventCommand request,
        CancellationToken cancellationToken)
    {
        var settlement = await _context.DailySettlements
            .FirstOrDefaultAsync(d => d.Id == request.DailySettlementId, cancellationToken)
            ?? throw new NotFoundException("DailySettlement", request.DailySettlementId);

        if (request.EventType == PaymentRequestType.CompanyPaysCourier)
        {
            if (!settlement.WasCourierPaid)
                throw new ConflictException("Courier salary for this settlement is not marked as paid.");

            settlement.WasCourierPaid = false;
            settlement.CourierPaidAt  = null;
        }
        else
        {
            if (!settlement.HasCourierHandedOverRevenue)
                throw new ConflictException("Revenue handover for this settlement is not recorded.");

            settlement.HasCourierHandedOverRevenue = false;
            settlement.RevenueHandedOverAt         = null;
        }

        var paymentRequest = await _context.PaymentRequests
            .FirstOrDefaultAsync(
                p => p.DailySettlementId == request.DailySettlementId
                  && p.Type == request.EventType,
                cancellationToken);

        if (paymentRequest is not null)
            _context.PaymentRequests.Remove(paymentRequest);

        await _context.SaveChangesAsync(cancellationToken);
    }
}
