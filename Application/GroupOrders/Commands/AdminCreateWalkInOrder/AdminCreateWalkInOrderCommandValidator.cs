using Application.Common.Interfaces;
using Application.GroupOrders.Commands.CreateGroupOrder;
using FluentValidation;

namespace Application.GroupOrders.Commands.AdminCreateWalkInOrder;

public sealed class AdminCreateWalkInOrderCommandValidator
    : AbstractValidator<AdminCreateWalkInOrderCommand>
{
    public AdminCreateWalkInOrderCommandValidator(IAppDbContext context)
    {
        RuleFor(x => x.Dto).NotNull();

        // Exactly one of: an existing customer id, or new-customer details.
        RuleFor(x => x.Dto)
            .Must(d => d.ExistingCustomerId.HasValue ^ d.NewCustomer is not null)
            .WithMessage("Provide either an existing customer or new customer details, not both.");

        When(x => x.Dto.NewCustomer is not null, () =>
        {
            // Only BusinessName and PhoneNumber are collected in the "Add Package" UI —
            // everything else (FirstName, LastName, IdNumber, City, District, Address) is
            // optional and stored blank/null. A blank IdNumber just means no dedup / no
            // auto-link when the person later registers (see CreateCustomerCommandHandler).
            RuleFor(x => x.Dto.NewCustomer!.BusinessName).NotEmpty().MaximumLength(150);
            RuleFor(x => x.Dto.NewCustomer!.PhoneNumber).NotEmpty().MaximumLength(20);
            RuleFor(x => x.Dto.NewCustomer!.FirstName).MaximumLength(100);
            RuleFor(x => x.Dto.NewCustomer!.LastName).MaximumLength(100);
            RuleFor(x => x.Dto.NewCustomer!.IdNumber).MaximumLength(50);
            RuleFor(x => x.Dto.NewCustomer!.City).MaximumLength(100);
            RuleFor(x => x.Dto.NewCustomer!.District).MaximumLength(100);
            RuleFor(x => x.Dto.NewCustomer!.Address).MaximumLength(250);
        });

        RuleFor(x => x.Dto.Orders)
            .NotEmpty().WithMessage("At least one package is required.")
            .Must(o => o.Count <= 300).WithMessage("Cannot create more than 300 packages at once.");

        // Reuse the per-package rules (recipient, city/district existence, price ≥ 0) that
        // the customer and partner create-order paths use.
        RuleForEach(x => x.Dto.Orders).SetValidator(new CreateOrderDtoValidator(context));
    }
}
