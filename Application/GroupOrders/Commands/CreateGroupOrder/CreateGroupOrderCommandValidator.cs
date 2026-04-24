using Application.GroupOrders.DTOs;
using FluentValidation;

namespace Application.GroupOrders.Commands.CreateGroupOrder;

public sealed class CreateGroupOrderCommandValidator : AbstractValidator<CreateGroupOrderCommand>
{
    public CreateGroupOrderCommandValidator()
    {
        RuleFor(x => x.Dto).NotNull();
        RuleFor(x => x.Dto.SenderFirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.SenderLastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.SenderIdNumber).MaximumLength(50)           // optional — no NotEmpty
            .When(x => x.Dto.SenderIdNumber is not null);
        RuleFor(x => x.Dto.SenderBusinessName).NotEmpty().MaximumLength(150); // was missing
        RuleFor(x => x.Dto.SenderPhone).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Dto.PickUpCity).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.PickUpDistrict).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.PickUpAddress).NotEmpty().MaximumLength(250);
        RuleFor(x => x.Dto.Note).MaximumLength(500).When(x => x.Dto.Note is not null);
        RuleFor(x => x.Dto.Orders)
            .NotEmpty().WithMessage("At least one order (package) is required.")
            .Must(o => o.Count <= 100).WithMessage("A single group order cannot exceed 100 packages.");
        RuleForEach(x => x.Dto.Orders).SetValidator(new CreateOrderDtoValidator());
    }
}

public sealed class CreateOrderDtoValidator : AbstractValidator<CreateOrderDto>
{
    public CreateOrderDtoValidator()
    {
        RuleFor(x => x.RecipientFirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.RecipientLastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.RecipientPhone).NotEmpty().MaximumLength(20);
        RuleFor(x => x.RecipientCity).NotEmpty().MaximumLength(100);
        RuleFor(x => x.RecipientDistrict).NotEmpty().MaximumLength(100);
        RuleFor(x => x.RecipientAddress).NotEmpty().MaximumLength(250);
        RuleFor(x => x.Description).MaximumLength(500).When(x => x.Description is not null);
    }
}