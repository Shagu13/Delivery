using FluentValidation;

namespace Application.Orders.Commands.ChangeOrderPayer;

public sealed class ChangeOrderPayerCommandValidator : AbstractValidator<ChangeOrderPayerCommand>
{
    public ChangeOrderPayerCommandValidator()
    {
        RuleFor(x => x.NewPayer).IsInEnum();
        RuleFor(x => x.CompanyServicePrice).GreaterThanOrEqualTo(0);
    }
}
