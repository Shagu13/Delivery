using FluentValidation;

namespace Application.Orders.Commands.SetCourierSalaryBulk;

public sealed class SetCourierSalaryBulkCommandValidator : AbstractValidator<SetCourierSalaryBulkCommand>
{
    public const int MaxOrders = 500;

    public SetCourierSalaryBulkCommandValidator()
    {
        RuleFor(x => x.OrderIds)
            .NotEmpty().WithMessage("Select at least one order.")
            .Must(ids => ids.Count <= MaxOrders).WithMessage($"At most {MaxOrders} orders per request.");
        RuleForEach(x => x.OrderIds).NotEmpty();
        RuleFor(x => x.Salary).GreaterThanOrEqualTo(0m).WithMessage("Salary must be zero or more.");
    }
}
