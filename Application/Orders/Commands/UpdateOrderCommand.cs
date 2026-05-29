using Domain.Enums;
using MediatR;

namespace Application.Orders.Commands;

/// <summary>
/// Admin edits all mutable fields of a single order.
/// No status restriction — admin can edit at any time.
/// CompanyRevenue is auto-recalculated when CourierSalary is set.
/// Status can now be set to ReturnedToSender or ExchangeCompleted via this command.
/// </summary>
public sealed record UpdateOrderCommand(
    Guid          OrderId,
    // Recipient / Delivery
    string        RecipientFirstName,
    string        RecipientLastName,
    string        RecipientPhone,
    string        RecipientCity,
    string        RecipientDistrict,
    string        RecipientAddress,
    // Package details
    string?       Description,
    bool          IsFragile,
    // Payment
    ServicePayer  WhoPaysForCompanyService,
    PaymentStatus ProductPaymentStatus,
    decimal?      AmountToCollectForPackage,
    // Financials
    decimal       CompanyServicePrice,
    decimal?      CourierSalary,
    // Order type & return address
    OrderType     OrderType            = OrderType.Send,
    string?       ReturnPickupAddress  = null,
    string?       ReturnPickupCity     = null,
    string?       ReturnPickupDistrict = null,
    // Optional explicit status override (used by admin to set ReturnedToSender / ExchangeCompleted)
    OrderStatus?  StatusOverride       = null
) : IRequest;
