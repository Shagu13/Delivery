using Application.Common.Interfaces;
using Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Commands;

public sealed class UpdateOrderByCustomerCommandValidator : AbstractValidator<UpdateOrderByCustomerCommand>
{
    private readonly IAppDbContext _context;

    public UpdateOrderByCustomerCommandValidator(IAppDbContext context)
    {
        _context = context;

        RuleFor(x => x.RecipientName)     .MaximumLength(201);   // optional — blank shows "Unknown"/"უცნობი"
        RuleFor(x => x.RecipientPhone)    .NotEmpty().MaximumLength(20);
        RuleFor(x => x.RecipientAddress)  .NotEmpty().MaximumLength(250);
        RuleFor(x => x.AmountToCollectForPackage)
            .GreaterThanOrEqualTo(0).When(x => x.AmountToCollectForPackage.HasValue);

        // For an unpaid parcel the recipient pays COD on delivery, so a positive amount
        // is required (mirrors the create form). Paid parcels carry no COD.
        RuleFor(x => x.AmountToCollectForPackage)
            .Must(amount => amount.HasValue && amount.Value > 0)
            .WithMessage("Parcel price is required when product is not pre-paid.")
            .WhenAsync((cmd, ct) => IsUnpaidOrderAsync(cmd.OrderId, ct));
    }

    private Task<bool> IsUnpaidOrderAsync(Guid orderId, CancellationToken ct) =>
        _context.Orders.AnyAsync(
            o => o.Id == orderId && o.ProductPaymentStatus == PaymentStatus.NotPaid, ct);
}
