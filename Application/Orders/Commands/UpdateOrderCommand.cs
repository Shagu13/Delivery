using Domain.Enums;
using MediatR;

namespace Application.Orders.Commands;

/// <summary>
/// Admin edits all mutable fields of a single order.
/// No status restriction — admin can edit at any time.
/// CompanyRevenue is auto-recalculated when CourierSalary is set.
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
    decimal?      CourierSalary
) : IRequest;
