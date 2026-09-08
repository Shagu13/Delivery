using FluentValidation;

namespace Application.GroupOrders.Commands.AssignCourierToGroupOrder;

public sealed class BulkAssignCourierToGroupOrdersCommandValidator
    : AbstractValidator<BulkAssignCourierToGroupOrdersCommand>
{
    public BulkAssignCourierToGroupOrdersCommandValidator()
    {
        RuleFor(x => x.GroupOrderIds).NotEmpty();
        RuleForEach(x => x.GroupOrderIds).NotEmpty();
        RuleFor(x => x.CourierId).NotEmpty();
    }
}
