using Domain;
using Domain.Enums;

namespace Application.Finance;

/// <summary>
/// The single source of truth for per-order finance figures, derived live from the
/// payment facts stored on <see cref="Order"/>. Replaces the snapshot fields that used to
/// live on the (now removed) CourierSettlement / CustomerSettlement aggregate tables, so
/// no figure can ever go stale.
///
/// <para><b>Cash conventions (so every case reduces to one formula):</b></para>
/// <list type="bullet">
/// <item><see cref="Order.CodTransferedToCompanyByCourier"/> = the total cash the courier
///   physically handed to the company, <b>net of any salary the courier kept</b>. For
///   recipient-pays orders this bundles package COD + the service fee collected at delivery
///   (mirroring <see cref="Order.AmountOfCashCollected"/>); for sender-pays orders it is the
///   package COD only.</item>
/// <item><see cref="Order.IsCourierSalaryIncludedSpecialCase"/> = the courier kept their
///   salary out of the cash they collected (so the handover above is already net of it, and
///   the company pays no separate salary cash). Defaulted true only for recipient-pays
///   orders.</item>
/// <item><see cref="Order.IsCompanyServicePriceIncludedSpecialCase"/> = the sender-paid
///   service fee was settled by netting it out of the COD payout to the customer, not as a
///   separate cash inflow.</item>
/// </list>
///
/// With those conventions the four business cases (product Paid/Unpaid × service paid by
/// Sender/Recipient) collapse to ONE net-cash formula, which at full settlement always
/// converges to <see cref="CompanyRevenue"/> (= CompanyServicePrice − CourierSalary).
/// </summary>
public static class OrderFinance
{
    /// <summary>Tolerance for decimal "fully settled" comparisons (sub-tetri).</summary>
    private const decimal Epsilon = 0.005m;

    /// <summary>
    /// A delivery that was deliberately failed-and-billed by whoever handled it: the courier
    /// declined it on the recipient's behalf, or an admin cancelled-and-charged / marked the
    /// Send/Exchange parcel returned to the sender. The single signal is an explicit
    /// <see cref="Order.CancellationReason"/> recorded at that moment — the courier picks one
    /// when cancelling a delivery, and the admin picks one in the equivalent "cancel & charge"
    /// / "returned to sender" actions. The company still bills the <b>sender</b> for the service
    /// fee and still pays the courier their salary, exactly as if the order had been sender-pays.
    ///
    /// Excluded (non-billable reasons): standalone Returns (their own flow),
    /// <see cref="CancellationReason.WarehouseNotReceived"/> (the parcel never physically arrived),
    /// and <see cref="CancellationReason.DidNotWant"/> (cancelled before the courier reached the
    /// recipient — no delivery service was rendered). A plain admin/customer cancellation records
    /// no reason and is therefore never billable, which is what lets an order be cancelled early
    /// without charging. The reason is cleared whenever an order is un-cancelled back into the
    /// flow, so a later-delivered order never carries a stale one.
    /// </summary>
    public static bool IsBillableFailedDelivery(Order o) =>
        o.OrderType != OrderType.Return
        && o.CancellationReason != null
        && o.CancellationReason != CancellationReason.WarehouseNotReceived
        && o.CancellationReason != CancellationReason.DidNotWant;

    /// <summary>
    /// When the settlement/billing event for a billable failed delivery happened, used to date
    /// it into a finance range: the admin "returned to sender" timestamp (DeliveredAt) or, for a
    /// cancellation, the CancelledAt timestamp.
    /// </summary>
    public static DateTime? FailedDeliveryEventAt(Order o) => o.DeliveredAt ?? o.CancelledAt;

    /// <summary>
    /// Effective payer of the company service fee. The recipient only ever pays when the parcel
    /// was actually delivered; on a billable failed delivery the recipient paid nothing, so the
    /// fee shifts to the sender as a receivable regardless of the order's original payer.
    /// </summary>
    private static bool RecipientPays(Order o) =>
        o.WhoPaysForCompanyService == ServicePayer.Recipient && !IsBillableFailedDelivery(o);

    /// <summary>
    /// True when the sender owes the company the WHOLE service fee for this order (sender-pays, or a
    /// billable failed delivery). A recipient-pays order carrying a <see cref="Order.CustomerSurcharge"/>
    /// still has the recipient paying most of the fee — its sender share is <see cref="SenderServiceShare"/>.
    /// </summary>
    public static bool SenderOwesService(Order o) => !RecipientPays(o);

    /// <summary>
    /// The part of the service fee collected from the recipient in cash at the door: the fee minus
    /// the <see cref="Order.CustomerSurcharge"/> the sender owes separately. Only meaningful for a
    /// recipient-pays order; callers decide whether the recipient pays at all.
    /// </summary>
    public static decimal RecipientFeePortion(Order o) =>
        Math.Max(0m, o.CompanyServicePrice - o.CustomerSurcharge);

    /// <summary>
    /// The part of the service fee the SENDER owes the company: the whole fee when the sender pays
    /// (or the delivery failed and is billable), only the <see cref="Order.CustomerSurcharge"/> when
    /// the recipient pays the rest. Zero for an ordinary recipient-pays order.
    /// </summary>
    public static decimal SenderServiceShare(Order o) =>
        SenderServiceShareOf(
            RecipientPays(o) ? ServicePayer.Recipient : ServicePayer.Sender, o.CompanyServicePrice, o.CustomerSurcharge);

    /// <summary>
    /// <see cref="SenderServiceShare"/> from raw figures, for queries (tenant settlements) that project
    /// columns instead of loading an <see cref="Order"/>. Takes the payer as given — callers that include
    /// billable failures must pass <see cref="ServicePayer.Sender"/> for them, as <see cref="SenderServiceShare"/> does.
    /// </summary>
    public static decimal SenderServiceShareOf(ServicePayer payer, decimal fee, decimal surcharge) =>
        payer == ServicePayer.Sender ? fee : Math.Min(Math.Max(0m, surcharge), fee);

    /// <summary>
    /// Service-fee value the company keeps for this order (i.e. not already inside the
    /// courier's cash handover) — the sender's share of the fee only:
    ///   • Recipient pays      → the recipient's portion is collected as cash by the courier and is
    ///                            already counted inside <see cref="Order.CodTransferedToCompanyByCourier"/>
    ///                            → 0 here (only a surcharge the sender owes counts, as below).
    ///   • Netted               → the company retained the sender's share out of the COD it paid the
    ///                            customer (<see cref="Order.IsCompanyServicePriceIncludedSpecialCase"/>);
    ///                            the COD payout is stored at the full obligation, so the
    ///                            retained share is counted back here.
    ///   • Direct               → whatever the customer has actually paid the company.
    /// </summary>
    public static decimal ServiceInflow(Order o)
    {
        decimal share = SenderServiceShare(o);
        if (share <= 0m) return 0m;
        if (o.IsCompanyServicePriceIncludedSpecialCase) return share;
        return o.ServicePaidByCustomerAmount ?? 0m;
    }

    /// <summary>
    /// The company's running cash position for this order:
    ///   cash handed over by courier − COD paid back to customer
    ///   − salary paid separately by the company + service cash received directly.
    /// When the courier kept their salary out of the collected cash
    /// (<see cref="Order.IsCourierSalaryIncludedSpecialCase"/>), the salary is already
    /// reflected in the reduced handover, so it is not subtracted again. Negative mid-flow
    /// (e.g. the customer was paid out before the courier transferred); converges to
    /// <see cref="CompanyRevenue"/> once everything is settled.
    /// </summary>
    public static decimal CompanyNetCash(Order o) =>
        (o.CodTransferedToCompanyByCourier ?? 0m)
      - (o.CodPaidToCustomerAmount        ?? 0m)
      - (CourierKeptSalaryFromCash(o) ? 0m : (o.CourierSalaryPaidAmount ?? 0m))
      + ServiceInflow(o);

    /// <summary>
    /// True when the courier kept their salary out of the cash they collected (so the company's
    /// handover is already net of it). Never true for a billable failed delivery — the courier
    /// collected no cash, so any salary the company pays them is a separate outflow.
    /// </summary>
    private static bool CourierKeptSalaryFromCash(Order o) =>
        o.IsCourierSalaryIncludedSpecialCase && !IsBillableFailedDelivery(o);

    /// <summary>The company's terminal margin on this order: service fee minus courier salary.</summary>
    public static decimal CompanyRevenue(Order o) =>
        o.CompanyServicePrice - (o.CourierSalary ?? 0m);

    /// <summary>
    /// Total cash the courier collected from the recipient and must account for: package COD
    /// plus, for recipient-pays orders, the recipient's portion of the service fee collected at
    /// delivery (the fee minus any surcharge the sender owes separately). A billable failed
    /// delivery collected nothing (the recipient declined the parcel), so it is zero.
    /// </summary>
    public static decimal ExpectedCourierCash(Order o) =>
        IsBillableFailedDelivery(o)
            ? 0m
            : (o.AmountToCollectForPackage ?? 0m) + (RecipientPays(o) ? RecipientFeePortion(o) : 0m);

    /// <summary>
    /// The cash recorded as collected for an already-delivered order, re-derived from its current
    /// fee and COD after an admin edit: recipient-pays bundles the recipient's portion of the fee
    /// into the cash, sender-pays is the package COD only. The same formula the delivery handlers
    /// apply at delivery time.
    /// </summary>
    public static decimal? DeliveredCashCollected(Order o) =>
        o.WhoPaysForCompanyService == ServicePayer.Recipient
            ? (o.AmountToCollectForPackage ?? 0m) + RecipientFeePortion(o)
            : o.AmountToCollectForPackage;

    /// <summary>
    /// Package COD the company still owes the customer for this order. A billable failed delivery
    /// collected no COD (the parcel was never handed over), so nothing is owed back.
    /// </summary>
    public static decimal CodOwedToCustomer(Order o) =>
        IsBillableFailedDelivery(o)
            ? 0m
            : (o.AmountToCollectForPackage ?? 0m) - (o.CodPaidToCustomerAmount ?? 0m);

    /// <summary>
    /// Company service fee the sender still owes for this order: their share of the fee
    /// (<see cref="SenderServiceShare"/> — 0 when the recipient pays it all in cash at delivery, only
    /// the surcharge when the recipient pays the rest, the full fee on a billable failed delivery),
    /// less anything the sender has already paid.
    /// </summary>
    public static decimal ServiceOwedBySender(Order o) =>
        SenderServiceShare(o) - (o.ServicePaidByCustomerAmount ?? 0m);

    /// <summary>True once the courier has been credited their full salary for this order.</summary>
    public static bool IsCourierSalaryPaid(Order o) =>
        (o.CourierSalary ?? 0m) - (o.CourierSalaryPaidAmount ?? 0m) <= Epsilon;

    /// <summary>
    /// True once the courier's leg of this order has produced money: it was delivered
    /// (<c>DeliveredAt</c>, or <c>DeliveredToWarehouseAt</c> for a Return drop-off) or it is a billable
    /// failed delivery. Assigned-but-not-yet-delivered and postponed orders are not — their salary
    /// and cash are not payable yet. Used by the assignment-dated settlement views, which list those
    /// open orders alongside the finished ones.
    /// </summary>
    public static bool IsCourierLegComplete(Order o) =>
        (o.DeliveredAt ?? o.DeliveredToWarehouseAt) != null || IsBillableFailedDelivery(o);

    /// <summary>Salary the company still owes the courier for this order (never negative).</summary>
    public static decimal CourierSalaryOutstanding(Order o) =>
        Math.Max(0m, (o.CourierSalary ?? 0m) - (o.CourierSalaryPaidAmount ?? 0m));

    /// <summary>
    /// Cash the courier may still record as handed over to the company for this order — the cap
    /// <c>PayCourierOrdersCommand</c> enforces. Recipient-pays orders: the courier keeps their
    /// salary out of the collected cash, so the handover is the collected total minus salary.
    /// Never negative.
    /// </summary>
    public static decimal CourierCodTransferOutstanding(Order o)
    {
        // Nothing is collected — so nothing can be handed over — until the order is delivered. A
        // postponed or in-progress order still has an *expected* cash figure (the scan flow shows it
        // to the courier), but it must not count as cash the courier owes the company.
        if (o.DeliveredAt is null && o.DeliveredToWarehouseAt is null) return 0m;

        decimal keptSalary = CourierKeepsSalaryFromCash(o) ? (o.CourierSalary ?? 0m) : 0m;
        return Math.Max(0m, ExpectedCourierCash(o) - keptSalary - (o.CodTransferedToCompanyByCourier ?? 0m));
    }

    /// <summary>
    /// Whether the courier's salary for this order comes out of the cash they collected: recipient-pays
    /// orders only, and not once the company has already paid that salary separately (a payment made
    /// before any hand-over, i.e. credited while <see cref="Order.IsCourierSalaryIncludedSpecialCase"/>
    /// is still unset) — keeping it as well would pay the courier twice. Once the hand-over has been
    /// recorded the flag is set and the credited salary is the kept one. The single rule behind both
    /// <see cref="CourierCodTransferOutstanding"/> and the handlers that record a hand-over.
    /// </summary>
    public static bool CourierKeepsSalaryFromCash(Order o) =>
        o.WhoPaysForCompanyService == ServicePayer.Recipient
        && (o.IsCourierSalaryIncludedSpecialCase || (o.CourierSalaryPaidAmount ?? 0m) <= Epsilon);

    /// <summary>
    /// A courier's net cash position for a set of orders (one day): all cash collected minus all salary
    /// earned, floored at zero. Salary on sender-pays orders is deducted too, even though the courier
    /// does not keep it out of that order's cash. This is the figure the admin settlement modal shows;
    /// the courier's own settlements page and the settlement preview use it so the three cannot drift.
    /// Per-order handover caps still use <see cref="CourierCodTransferOutstanding"/>.
    /// </summary>
    public static decimal CourierNetCashDue(IEnumerable<Order> orders) =>
        Math.Max(0m, orders.Sum(o => o.AmountOfCashCollected ?? 0m) - orders.Sum(o => o.CourierSalary ?? 0m));

    /// <summary>
    /// True once the sender's share of the service fee is fully settled. Always true when the
    /// recipient pays it all (collected in cash at delivery) or when it was netted out of the COD payout.
    /// </summary>
    public static bool IsCompanyServicePaid(Order o)
    {
        decimal share = SenderServiceShare(o);
        return share <= Epsilon
            || o.IsCompanyServicePriceIncludedSpecialCase
            || share - (o.ServicePaidByCustomerAmount ?? 0m) <= Epsilon;
    }

    /// <summary>
    /// The stored <see cref="Order.CompanyServicePaymentStatus"/> value that matches the live
    /// figures: Paid once the sender's share of the fee is settled (always, for an ordinary
    /// recipient-pays order), Pending once part of it is paid, otherwise Unpaid.
    /// </summary>
    public static CompanyServicePaymentStatus ServicePaymentStatus(Order o) =>
        IsCompanyServicePaid(o)                         ? CompanyServicePaymentStatus.Paid
        : (o.ServicePaidByCustomerAmount ?? 0m) > Epsilon ? CompanyServicePaymentStatus.Pending
                                                          : CompanyServicePaymentStatus.Unpaid;

    /// <summary>True once the company has paid the customer back the full package COD.</summary>
    public static bool IsCodPaidToCustomer(Order o) =>
        (o.AmountToCollectForPackage ?? 0m) - (o.CodPaidToCustomerAmount ?? 0m) <= Epsilon;

    /// <summary>
    /// What the courier still has to send the company for this order: the cash they were
    /// expected to collect, less whatever they've already transferred and (when applicable)
    /// the salary they kept out of it instead of the company paying it separately. Zero once
    /// fully accounted; never negative in the normal flow (a courier can't transfer more than
    /// they collected).
    /// </summary>
    public static decimal OutstandingCourierRemittance(Order o)
    {
        decimal transferred = o.CodTransferedToCompanyByCourier ?? 0m;
        decimal keptSalary  = CourierKeptSalaryFromCash(o) ? (o.CourierSalaryPaidAmount ?? 0m) : 0m;
        return ExpectedCourierCash(o) - transferred - keptSalary;
    }

    /// <summary>
    /// True once the courier has accounted for all the cash they collected — via the cash
    /// handed over plus, when applicable, the salary they kept out of it.
    /// </summary>
    public static bool HasCourierTransferedAmount(Order o) =>
        OutstandingCourierRemittance(o) <= Epsilon;
}
