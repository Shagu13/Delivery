using Domain.Enums;
using FluentValidation;

namespace Application.Orders.Commands;

// Validators for the last-mile command set in OrderCommands.cs. Identifier-only commands
// (SendOrderToCityCommand, AssignCourierToOrderCommand, RetryDeliveryCommand,
// MarkSendReturnedToSenderCommand, …) intentionally have none — see Application/CLAUDE.md:
// "a sealed validator per command with a non-identifier payload".

public sealed class MarkOrderDeliveredCommandValidator : AbstractValidator<MarkOrderDeliveredCommand>
{
    public MarkOrderDeliveredCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.CourierUserId).NotEmpty();
        RuleFor(x => x.UpdatedCodAmount!.Value)
            .GreaterThanOrEqualTo(0m).When(x => x.UpdatedCodAmount.HasValue)
            .WithMessage("Updated COD amount must be zero or more.");
    }
}

public sealed class PostponeOrderCommandValidator : AbstractValidator<PostponeOrderCommand>
{
    public PostponeOrderCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.CourierUserId).NotEmpty();
        RuleFor(x => x.Reason).IsInEnum();
        RuleFor(x => x.Comment)
            .NotEmpty().When(x => x.Reason == PostponeReason.Other)
            .WithMessage("A comment is required when the reason is \"Other\".");
        RuleFor(x => x.Comment).MaximumLength(500).When(x => x.Comment != null);
    }
}

public sealed class AdminPostponeOrderCommandValidator : AbstractValidator<AdminPostponeOrderCommand>
{
    public AdminPostponeOrderCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.Reason).IsInEnum();
        RuleFor(x => x.Comment)
            .NotEmpty().When(x => x.Reason == PostponeReason.Other)
            .WithMessage("A comment is required when the reason is \"Other\".");
        RuleFor(x => x.Comment).MaximumLength(500).When(x => x.Comment != null);
    }
}

public sealed class CancelOrderByCourierCommandValidator : AbstractValidator<CancelOrderByCourierCommand>
{
    public CancelOrderByCourierCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.CourierUserId).NotEmpty();
        RuleFor(x => x.Reason).IsInEnum()
            .Must(r => r != CancellationReason.WarehouseNotReceived)
            .WithMessage("WarehouseNotReceived is set by an admin during warehouse acceptance, not by a courier.");
        RuleFor(x => x.Comment)
            .NotEmpty().When(x => x.Reason == CancellationReason.Other)
            .WithMessage("A comment is required when the reason is \"Other\".");
        RuleFor(x => x.Comment).MaximumLength(500).When(x => x.Comment != null);
    }
}

public sealed class CancelOrderByAdminCommandValidator : AbstractValidator<CancelOrderByAdminCommand>
{
    public CancelOrderByAdminCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.Reason!.Value)
            .IsInEnum()
            .Must(r => r != CancellationReason.WarehouseNotReceived)
            .When(x => x.Reason.HasValue)
            .WithMessage("WarehouseNotReceived is not a valid admin cancellation reason.");
        RuleFor(x => x.Comment)
            .NotEmpty().When(x => x.Reason == CancellationReason.Other)
            .WithMessage("A comment is required when the reason is \"Other\".");
        RuleFor(x => x.Comment).MaximumLength(500).When(x => x.Comment != null);
    }
}

public sealed class AdminCorrectOrderStatusCommandValidator : AbstractValidator<AdminCorrectOrderStatusCommand>
{
    public AdminCorrectOrderStatusCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.Correction).IsInEnum();
    }
}

public sealed class AdminMarkOrderDeliveredCommandValidator : AbstractValidator<AdminMarkOrderDeliveredCommand>
{
    public AdminMarkOrderDeliveredCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.CourierId!.Value).NotEmpty().When(x => x.CourierId.HasValue)
            .WithMessage("CourierId, when supplied, must not be empty.");
        RuleFor(x => x.Salary!.Value)
            .GreaterThanOrEqualTo(0m).When(x => x.Salary.HasValue)
            .WithMessage("Salary must be zero or more.");
    }
}

public sealed class SetCourierSalaryCommandValidator : AbstractValidator<SetCourierSalaryCommand>
{
    public SetCourierSalaryCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.Salary).GreaterThanOrEqualTo(0m).WithMessage("Salary must be zero or more.");
    }
}

public sealed class SetOrderCompanyServicePriceCommandValidator : AbstractValidator<SetOrderCompanyServicePriceCommand>
{
    public SetOrderCompanyServicePriceCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.Price).GreaterThanOrEqualTo(0m).WithMessage("Price must be zero or more.");
    }
}

public sealed class SetOrderPricesCommandValidator : AbstractValidator<SetOrderPricesCommand>
{
    public SetOrderPricesCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.CompanyServicePrice).GreaterThanOrEqualTo(0m).WithMessage("Service price must be zero or more.");
        RuleFor(x => x.AmountToCollectForPackage!.Value)
            .GreaterThanOrEqualTo(0m).When(x => x.AmountToCollectForPackage.HasValue)
            .WithMessage("COD must be zero or more.");
    }
}

public sealed class SetDistrictCompanyServicePriceCommandValidator : AbstractValidator<SetDistrictCompanyServicePriceCommand>
{
    public SetDistrictCompanyServicePriceCommandValidator()
    {
        RuleFor(x => x.DistrictId).NotEmpty();
        RuleFor(x => x.Price!.Value)
            .GreaterThanOrEqualTo(0m).When(x => x.Price.HasValue)
            .WithMessage("Price must be zero or more.");
    }
}

public sealed class SetDistrictTerritoryCommandValidator : AbstractValidator<SetDistrictTerritoryCommand>
{
    public SetDistrictTerritoryCommandValidator()
    {
        RuleFor(x => x.DistrictId).NotEmpty();
        RuleFor(x => x)
            .Must(x => !(x.IsCapitalTerritory && x.IsCityTerritory))
            .WithMessage("A district cannot be both capital territory and city territory.");
    }
}

public sealed class BulkAssignCourierToOrdersCommandValidator : AbstractValidator<BulkAssignCourierToOrdersCommand>
{
    public BulkAssignCourierToOrdersCommandValidator()
    {
        RuleFor(x => x.OrderIds).NotEmpty();
        RuleForEach(x => x.OrderIds).NotEmpty();
        RuleFor(x => x.CourierId).NotEmpty();
    }
}
