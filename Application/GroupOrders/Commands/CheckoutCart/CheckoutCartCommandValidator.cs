using Application.Common.Interfaces;
using Application.GroupOrders.Commands.CreateGroupOrder;
using FluentValidation;

namespace Application.GroupOrders.Commands.CheckoutCart;

/// <summary>
/// Mirrors <see cref="CreateGroupOrderCommandValidator"/>: the sender + pickup fields
/// and every package must be valid. The single-vs-batch split is decided in the handler,
/// so validation is identical for both paths. Reuses <see cref="CreateOrderDtoValidator"/>.
/// </summary>
public sealed class CheckoutCartCommandValidator : AbstractValidator<CheckoutCartCommand>
{
    public CheckoutCartCommandValidator(IAppDbContext context)
    {
        RuleFor(x => x.Dto).NotNull();
        RuleFor(x => x.Dto.SenderFirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.SenderLastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.SenderIdNumber).MaximumLength(50)
            .When(x => x.Dto.SenderIdNumber is not null);
        RuleFor(x => x.Dto.SenderBusinessName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.Dto.SenderPhone).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Dto.AlternativeSenderPhone).MaximumLength(20)
            .When(x => !string.IsNullOrWhiteSpace(x.Dto.AlternativeSenderPhone));
        RuleFor(x => x.Dto.PickUpCity).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.PickUpDistrict).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.PickUpAddress).NotEmpty().MaximumLength(250);
        RuleFor(x => x.Dto.Note).MaximumLength(500).When(x => x.Dto.Note is not null);
        RuleFor(x => x.Dto.Orders)
            .NotEmpty().WithMessage("At least one order (package) is required.")
            .Must(o => o.Count <= 300).WithMessage("A single checkout cannot exceed 300 packages.");
        RuleForEach(x => x.Dto.Orders).SetValidator(new CreateOrderDtoValidator(context));
    }
}
