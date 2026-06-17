using FluentValidation;

namespace Application.Orders.Commands;

public sealed class UpdateOrderCommandValidator : AbstractValidator<UpdateOrderCommand>
{
    public UpdateOrderCommandValidator()
    {
        RuleFor(x => x.RecipientName)     .MaximumLength(201);   // optional — blank shows "Unknown"/"უცნობი"
        RuleFor(x => x.RecipientPhone)    .NotEmpty().MaximumLength(30);
        RuleFor(x => x.RecipientCity)     .NotEmpty().MaximumLength(100);
        RuleFor(x => x.RecipientDistrict) .NotEmpty().MaximumLength(100);
        RuleFor(x => x.RecipientAddress)  .NotEmpty().MaximumLength(300);
        RuleFor(x => x.Description)       .MaximumLength(500).When(x => x.Description != null);
        RuleFor(x => x.CompanyServicePrice).GreaterThanOrEqualTo(0);
        RuleFor(x => x.CourierSalary)      .GreaterThanOrEqualTo(0).When(x => x.CourierSalary.HasValue);
        RuleFor(x => x.AmountToCollectForPackage).GreaterThanOrEqualTo(0).When(x => x.AmountToCollectForPackage.HasValue);
    }
}
