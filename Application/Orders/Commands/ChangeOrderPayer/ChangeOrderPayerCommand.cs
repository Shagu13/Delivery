using Domain.Enums;
using MediatR;

namespace Application.Orders.Commands.ChangeOrderPayer;

/// <summary>
/// Admin corrects who pays the company service fee on an already-delivered Send order
/// (Sender ⇄ Recipient) and, in the same transaction, re-derives every dependent figure — cash collected,
/// the sender's / tenant's fee payment, COD-netting, the courier's handed-over cash — and trims the
/// affected payment receipts. See <see cref="OrderPayerChangePolicy"/> for the exact rules.
/// <paramref name="CompanyServicePrice"/> is the fee after the change: the admin confirms the suggested
/// one (customer special price → negotiated rate → district default) or types their own.
/// </summary>
public sealed record ChangeOrderPayerCommand(
    Guid         OrderId,
    ServicePayer NewPayer,
    decimal      CompanyServicePrice
) : IRequest;
