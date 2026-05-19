using MediatR;

namespace Application.Sms.Queries;

/// <summary>
/// Returns the current SMS credit balance from UBill.
/// Admin-only — no input parameters needed (single-tenant app).
/// </summary>
public sealed record GetSmsBalanceQuery : IRequest<int>;
