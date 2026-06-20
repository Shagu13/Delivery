using FluentValidation;

namespace Application.GroupOrders.Commands.MergeGroupOrders;

public sealed class MergeGroupOrdersCommandValidator : AbstractValidator<MergeGroupOrdersCommand>
{
    public MergeGroupOrdersCommandValidator()
    {
        RuleFor(x => x.TargetGroupOrderId).NotEmpty();
        RuleFor(x => x.SourceGroupOrderIds)
            .NotEmpty().WithMessage("Select at least one batch to merge into the target.");
    }
}
