using Domain.Enums;
using FluentValidation;

namespace Application.Orders.Commands;

public sealed class UpdateOrderByCustomerCommandValidator : AbstractValidator<UpdateOrderByCustomerCommand>
{
    public UpdateOrderByCustomerCommandValidator()
    {
        RuleFor(x => x.RecipientName)     .MaximumLength(201);   // optional — blank shows "Unknown"/"უცნობი"
        RuleFor(x => x.RecipientPhone)    .NotEmpty().MaximumLength(20);
        RuleFor(x => x.RecipientAddress)  .NotEmpty().MaximumLength(250);
        RuleFor(x => x.Description)       .MaximumLength(500).When(x => x.Description != null);
        RuleFor(x => x.AmountToCollectForPackage)
            .GreaterThanOrEqualTo(0).When(x => x.AmountToCollectForPackage.HasValue);

        // For an unpaid parcel the recipient pays COD on delivery, so a positive amount is
        // required (mirrors the create form). Paid parcels carry no COD. Checked against the
        // *requested* status (the customer may be switching Paid -> NotPaid in this same
        // request), never the row's current status.
        RuleFor(x => x.AmountToCollectForPackage)
            .Must(amount => amount.HasValue && amount.Value > 0)
            .WithMessage("Parcel price is required when product is not pre-paid.")
            .When(x => x.ProductPaymentStatus == PaymentStatus.NotPaid);
    }
}
