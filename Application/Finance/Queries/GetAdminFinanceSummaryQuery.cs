using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Finance.Queries;

// ── DTOs ──────────────────────────────────────────────────────────────────────

/// <summary>
/// Aggregated financial summary for a single calendar month (or the full selected range).
/// All monetary values in GEL (₾).
/// </summary>
public sealed record AdminFinanceSummaryDto(
    int    Year,
    int    Month,

    // ── Revenue ───────────────────────────────────────────────────────────────
    /// <summary>Sum of CompanyServicePrice across all delivered orders in the period.</summary>
    decimal GrossServiceRevenue,

    /// <summary>Sum of CourierSalary across all delivered orders in the period.</summary>
    decimal TotalCourierSalaries,

    /// <summary>GrossServiceRevenue − TotalCourierSalaries.</summary>
    decimal NetServiceIncome,

    // ── COD flows ─────────────────────────────────────────────────────────────
    /// <summary>Total COD cash collected from recipients by couriers.</summary>
    decimal TotalCodCollected,

    /// <summary>COD cash already forwarded back to senders (HasCompanyPaidTheSender = true).</summary>
    decimal TotalCodPaidToSenders,

    /// <summary>COD cash still owed to senders (not yet forwarded).</summary>
    decimal TotalCodOwedToSenders,

    // ── Sender service-fee payments ───────────────────────────────────────────
    /// <summary>Total service fees confirmed as received from senders (SenderPaysCompany, Confirmed).</summary>
    decimal TotalReceivedFromSenders,

    // ── Courier cash flow ─────────────────────────────────────────────────────
    /// <summary>Total cash handed over by couriers to the company (CourierHandsOverRevenue).</summary>
    decimal TotalCourierHandovers,

    /// <summary>Total salary paid out to couriers (CompanyPaysCourier).</summary>
    decimal TotalCourierSalaryPaid,

    // ── Activity ──────────────────────────────────────────────────────────────
    int TotalOrdersDelivered,
    int TotalSettlementsCreated
);

/// <summary>
/// All-time cash position of the company derived from every confirmed PaymentRequest ever.
/// CashIn  = CourierHandsOverRevenue + SenderPaysCompany (confirmed AmountConfirmed)
/// CashOut = CompanyPaysSender + CompanyPaysCourier (confirmed AmountConfirmed)
/// Balance = CashIn − CashOut
/// </summary>
public sealed record CompanyCashBalanceDto(
    decimal CashIn,
    decimal CashOut,
    decimal Balance
);

/// <summary>
/// A single PaymentRequest event row in the ledger history.
/// </summary>
public sealed record FinanceLedgerEntryDto(
    Guid      Id,
    string    Type,           // "SenderPaysCompany" | "CompanyPaysSender" | "CompanyPaysCourier" | "CourierHandsOverRevenue"
    string    Direction,      // "In" | "Out"
    decimal   Amount,
    string    Status,
    string?   CounterpartyName,
    string?   Note,
    DateTime  CreatedAt,
    DateTime? ConfirmedAt
);

public sealed record AdminFinancePageDto(
    IReadOnlyList<AdminFinanceSummaryDto> MonthlySummaries,
    IReadOnlyList<FinanceLedgerEntryDto>  LedgerEntries,
    int                  TotalLedgerCount,
    int                  Page,
    int                  PageSize,
    CompanyCashBalanceDto CashBalance
);

// ── Query ─────────────────────────────────────────────────────────────────────

/// <summary>
/// Returns month-by-month financial summary for the admin Finance page,
/// plus a paginated ledger of all PaymentRequest events.
/// </summary>
/// <param name="MonthsBack">How many months back to include in summaries (default 6).</param>
/// <param name="LedgerPage">0-based page index for the ledger (default 0).</param>
/// <param name="LedgerPageSize">Rows per ledger page (default 30).</param>
/// <param name="TypeFilter">Optional: filter ledger by PaymentRequestType name.</param>
public sealed record GetAdminFinanceSummaryQuery(
    int     MonthsBack    = 6,
    int     LedgerPage    = 0,
    int     LedgerPageSize = 30,
    string? TypeFilter    = null
) : IRequest<AdminFinancePageDto>;

// ── Handler ───────────────────────────────────────────────────────────────────

public sealed class GetAdminFinanceSummaryQueryHandler
    : IRequestHandler<GetAdminFinanceSummaryQuery, AdminFinancePageDto>
{
    private readonly IAppDbContext _context;
    public GetAdminFinanceSummaryQueryHandler(IAppDbContext context) => _context = context;

    public async Task<AdminFinancePageDto> Handle(
        GetAdminFinanceSummaryQuery request,
        CancellationToken cancellationToken)
    {
        var now        = DateTime.UtcNow;
        var rangeStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc)
                             .AddMonths(-(request.MonthsBack - 1));

        // ── 1. Monthly summaries ──────────────────────────────────────────────
        // Pull all delivered orders in the range (for revenue / COD metrics)
        var orders = await _context.Orders
            .AsNoTracking()
            .Where(o => o.Status == OrderStatus.DeliveredToRecipient
                     && o.DeliveredAt >= rangeStart)
            .Select(o => new
            {
                o.DeliveredAt,
                o.CompanyServicePrice,
                o.CourierSalary,
                o.AmountOfCashCollected,
                o.AmountToCollectForPackage,
                o.HasCompanyPaidTheSender,
            })
            .ToListAsync(cancellationToken);

        // Pull all settlements in the range (for delivered / settlement counts)
        var settlements = await _context.DailySettlements
            .AsNoTracking()
            .Where(s => s.CreatedAt >= rangeStart)
            .Select(s => new { s.CreatedAt, s.TotalOrdersDelivered })
            .ToListAsync(cancellationToken);

        // Pull all payment requests in the range (for confirmed flows)
        var paymentRequests = await _context.PaymentRequests
            .AsNoTracking()
            .Where(p => p.CreatedAt >= rangeStart)
            .Select(p => new
            {
                p.CreatedAt,
                p.Type,
                p.Status,
                p.AmountConfirmed,
                p.TotalAmount,
            })
            .ToListAsync(cancellationToken);

        // All-time cash balance — not scoped to the display range
        var allConfirmed = await _context.PaymentRequests
            .AsNoTracking()
            .Where(p => p.Status == PaymentRequestStatus.Confirmed)
            .Select(p => new { p.Type, p.AmountConfirmed })
            .ToListAsync(cancellationToken);

        var cashIn  = allConfirmed
            .Where(p => p.Type == PaymentRequestType.CourierHandsOverRevenue
                     || p.Type == PaymentRequestType.SenderPaysCompany)
            .Sum(p => p.AmountConfirmed);
        var cashOut = allConfirmed
            .Where(p => p.Type == PaymentRequestType.CompanyPaysSender
                     || p.Type == PaymentRequestType.CompanyPaysCourier)
            .Sum(p => p.AmountConfirmed);
        var cashBalance = new CompanyCashBalanceDto(cashIn, cashOut, cashIn - cashOut);

        // Build month buckets
        var monthlySummaries = new List<AdminFinanceSummaryDto>();
        for (int i = 0; i < request.MonthsBack; i++)
        {
            var monthStart = rangeStart.AddMonths(i);
            var monthEnd   = monthStart.AddMonths(1);

            var mo = orders.Where(o => o.DeliveredAt >= monthStart && o.DeliveredAt < monthEnd).ToList();
            var ms = settlements.Where(s => s.CreatedAt >= monthStart && s.CreatedAt < monthEnd).ToList();
            var mp = paymentRequests.Where(p => p.CreatedAt >= monthStart && p.CreatedAt < monthEnd).ToList();

            var grossRevenue    = mo.Sum(o => o.CompanyServicePrice);
            var totalSalaries   = mo.Sum(o => o.CourierSalary ?? 0m);
            var totalCodCollected = mo.Sum(o => o.AmountOfCashCollected ?? 0m);
            // Use confirmed CompanyPaysSender PaymentRequests for accuracy (accounts for service-fee netting)
            var codPaid         = mp
                .Where(p => p.Type   == PaymentRequestType.CompanyPaysSender
                         && p.Status == PaymentRequestStatus.Confirmed)
                .Sum(p => p.AmountConfirmed);
            var codOwed         = mo.Where(o => !o.HasCompanyPaidTheSender && (o.AmountToCollectForPackage ?? 0m) > 0)
                                    .Sum(o => o.AmountToCollectForPackage ?? 0m);

            var receivedFromSenders = mp
                .Where(p => p.Type == PaymentRequestType.SenderPaysCompany
                         && p.Status == PaymentRequestStatus.Confirmed)
                .Sum(p => p.AmountConfirmed);

            var courierHandovers = mp
                .Where(p => p.Type == PaymentRequestType.CourierHandsOverRevenue
                         && p.Status == PaymentRequestStatus.Confirmed)
                .Sum(p => p.AmountConfirmed);

            var salaryPaid = mp
                .Where(p => p.Type == PaymentRequestType.CompanyPaysCourier
                         && p.Status == PaymentRequestStatus.Confirmed)
                .Sum(p => p.AmountConfirmed);

            monthlySummaries.Add(new AdminFinanceSummaryDto(
                Year:                   monthStart.Year,
                Month:                  monthStart.Month,
                GrossServiceRevenue:    grossRevenue,
                TotalCourierSalaries:   totalSalaries,
                NetServiceIncome:       grossRevenue - totalSalaries,
                TotalCodCollected:      totalCodCollected,
                TotalCodPaidToSenders:  codPaid,
                TotalCodOwedToSenders:  codOwed,
                TotalReceivedFromSenders: receivedFromSenders,
                TotalCourierHandovers:  courierHandovers,
                TotalCourierSalaryPaid: salaryPaid,
                TotalOrdersDelivered:   ms.Sum(s => s.TotalOrdersDelivered),
                TotalSettlementsCreated: ms.Count
            ));
        }

        // ── 2. Ledger (paginated, all-time) ───────────────────────────────────
        var ledgerQuery = _context.PaymentRequests
            .AsNoTracking()
            .Include(p => p.Customer)
            .Include(p => p.Courier)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.TypeFilter)
            && Enum.TryParse<PaymentRequestType>(request.TypeFilter, out var parsedType))
        {
            ledgerQuery = ledgerQuery.Where(p => p.Type == parsedType);
        }

        var totalCount = await ledgerQuery.CountAsync(cancellationToken);

        var ledgerRows = await ledgerQuery
            .OrderByDescending(p => p.CreatedAt)
            .Skip(request.LedgerPage * request.LedgerPageSize)
            .Take(request.LedgerPageSize)
            .ToListAsync(cancellationToken);

        // Direction: In = money company receives, Out = money company pays
        static string Direction(PaymentRequestType t) => t switch
        {
            PaymentRequestType.SenderPaysCompany      => "In",
            PaymentRequestType.CourierHandsOverRevenue => "In",
            PaymentRequestType.CompanyPaysSender       => "Out",
            PaymentRequestType.CompanyPaysCourier      => "Out",
            _                                          => "In",
        };

        var ledgerDtos = ledgerRows.Select(p => new FinanceLedgerEntryDto(
            Id:               p.Id,
            Type:             p.Type.ToString(),
            Direction:        Direction(p.Type),
            Amount:           p.Status == PaymentRequestStatus.Confirmed ? p.AmountConfirmed : p.TotalAmount,
            Status:           p.Status.ToString(),
            CounterpartyName: p.Customer != null
                ? p.Customer.BusinessName
                : (p.Courier != null ? $"{p.Courier.FirstName} {p.Courier.LastName}" : null),
            Note:             p.Note,
            CreatedAt:        p.CreatedAt,
            ConfirmedAt:      p.ConfirmedAt
        )).ToList();

        return new AdminFinancePageDto(
            MonthlySummaries: monthlySummaries,
            LedgerEntries:    ledgerDtos,
            TotalLedgerCount: totalCount,
            Page:             request.LedgerPage,
            PageSize:         request.LedgerPageSize,
            CashBalance:      cashBalance
        );
    }
}
