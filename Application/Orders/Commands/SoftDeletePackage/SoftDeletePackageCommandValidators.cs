using FluentValidation;

namespace Application.Orders.Commands.SoftDeletePackage;

public sealed class SoftDeleteOrderCommandValidator : AbstractValidator<SoftDeleteOrderCommand>
{
    public SoftDeleteOrderCommandValidator()
        => RuleFor(x => x.OrderId).NotEmpty();
}

public sealed class SoftDeleteGroupOrderCommandValidator : AbstractValidator<SoftDeleteGroupOrderCommand>
{
    public SoftDeleteGroupOrderCommandValidator()
        => RuleFor(x => x.GroupOrderId).NotEmpty();
}

public sealed class BulkSoftDeleteOrdersCommandValidator : AbstractValidator<BulkSoftDeleteOrdersCommand>
{
    public BulkSoftDeleteOrdersCommandValidator()
    {
        RuleFor(x => x.OrderIds).NotEmpty();
        RuleForEach(x => x.OrderIds).NotEmpty();
    }
}
