using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Orders.Commands.ChangeOrderPayer;
using Domain;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Queries.GetOrderPayerChangePreview;

/// <summary>
/// Dry run of <see cref="ChangeOrderPayerCommand"/>: the fee the customer's pricing resolves to for this order
/// and every field / receipt / warning the change would produce. <paramref name="Fee"/> null = use the suggested
/// fee (when none exists the lines stay empty until the admin enters one). Nothing is saved.
/// </summary>
public sealed record GetOrderPayerChangePreviewQuery(
    Guid         OrderId,
    ServicePayer NewPayer,
    decimal?     Fee
) : IRequest<PayerChangePreviewDto>;

public sealed class GetOrderPayerChangePreviewQueryValidator : AbstractValidator<GetOrderPayerChangePreviewQuery>
{
    public GetOrderPayerChangePreviewQueryValidator()
    {
        RuleFor(x => x.NewPayer).IsInEnum();
        RuleFor(x => x.Fee).GreaterThanOrEqualTo(0).When(x => x.Fee.HasValue);
    }
}

public sealed class GetOrderPayerChangePreviewQueryHandler
    : IRequestHandler<GetOrderPayerChangePreviewQuery, PayerChangePreviewDto>
{
    private readonly IAppDbContext _context;
    public GetOrderPayerChangePreviewQueryHandler(IAppDbContext context) => _context = context;

    public async Task<PayerChangePreviewDto> Handle(GetOrderPayerChangePreviewQuery request, CancellationToken ct)
    {
        // Untracked: the policy mutates this copy to compute the "after" state, which must never be saved.
        Order order = await _context.Orders
            .AsNoTracking()
            .Include(o => o.GroupOrder)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException("Order", request.OrderId);

        OrderPayerChangePolicy.EnsureEligible(order, request.NewPayer);

        ServicePayer currentPayer = order.WhoPaysForCompanyService;
        (decimal? suggested, Application.Finance.OrderFeeSource source) =
            await OrderServiceFeeResolver.ResolveAsync(_context, order, ct);

        decimal? fee = request.Fee ?? suggested;
        if (fee is null)
        {
            return new PayerChangePreviewDto(
                currentPayer, request.NewPayer, suggested, source, null,
                Array.Empty<PayerChangeLine>(), Array.Empty<PayerChangeWarning>());
        }

        PayerChangeComputation result = OrderPayerChangePolicy.Apply(order, request.NewPayer, fee.Value);
        return new PayerChangePreviewDto(
            currentPayer, request.NewPayer, suggested, source, fee, result.Lines, result.Warnings);
    }
}
