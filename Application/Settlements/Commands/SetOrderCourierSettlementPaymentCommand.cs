using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Finance;
using Domain;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Settlements.Commands;

/// <summary>
/// Records (or clears) the courier-side settlement facts for a single delivered order.
/// Two directions, either/both may be supplied:
///   • Courier salary (company → courier) — toggled by <paramref name="SalaryPaid"/>; the
///     amount defaults to the order's <see cref="Order.CourierSalary"/> when not given.
///   • COD hand-over (courier → company) — toggled by <paramref name="CodTransferred"/>; the
///     amount defaults to the full cash the courier collected (package COD, plus the service
///     fee for recipient-pays orders), net of any salary the courier keeps.
///
/// Replaces the old day-level CourierSettlement create/update; the per-order fields are the
/// source of truth and every aggregate is derived live (see <see cref="OrderFinance"/>).
/// </summary>
public sealed record SetOrderCourierSettlementPaymentCommand(
    Guid     OrderId,
    decimal? SalaryPaidAmount,
    bool?    SalaryPaid,
    decimal? CodTransferredAmount,
    bool?    CodTransferred
) : IRequest<Guid>;

public sealed class SetOrderCourierSettlementPaymentCommandHandler
    : IRequestHandler<SetOrderCourierSettlementPaymentCommand, Guid>
{
    private readonly IAppDbContext _context;
    public SetOrderCourierSettlementPaymentCommandHandler(IAppDbContext context) => _context = context;

    public async Task<Guid> Handle(
        SetOrderCourierSettlementPaymentCommand request,
        CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        var now = CustomTime.Now;

        // Whether the courier keeps their salary out of the cash they collected. Auto-set
        // for recipient-pays orders (the courier holds the service-fee cash to draw from);
        // sender-pays salaries are paid out separately by the company.
        bool keepSalary = OrderFinance.CourierKeepsSalaryFromCash(order);

        if (request.CodTransferred is bool transferred)
        {
            if (transferred)
            {
                order.IsCourierSalaryIncludedSpecialCase = keepSalary;

                decimal salary   = order.CourierSalary ?? 0m;
                decimal expected = OrderFinance.ExpectedCourierCash(order);
                order.CodTransferedToCompanyByCourier = request.CodTransferredAmount
                    ?? (keepSalary ? expected - salary : expected);
                order.CodTransferedToCompanyByCourierAt = now;

                // When the courier keeps their salary, handing over the (reduced) cash also
                // settles their salary — credit it unless the caller is setting it explicitly.
                if (keepSalary && request.SalaryPaid is null)
                {
                    order.CourierSalaryPaidAmount = salary;
                    order.CourierSalaryPaidAt     = now;
                }
            }
            else
            {
                order.IsCourierSalaryIncludedSpecialCase = false;
                order.CodTransferedToCompanyByCourier    = null;
                order.CodTransferedToCompanyByCourierAt   = null;
            }
        }

        if (request.SalaryPaid is bool salaryPaid)
        {
            if (salaryPaid)
            {
                order.CourierSalaryPaidAmount = request.SalaryPaidAmount ?? order.CourierSalary ?? 0m;
                order.CourierSalaryPaidAt     = now;
            }
            else
            {
                order.CourierSalaryPaidAmount = null;
                order.CourierSalaryPaidAt     = null;
            }
        }

        await _context.SaveChangesAsync(cancellationToken);
        return order.Id;
    }
}
