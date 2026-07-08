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

    /// <summary>True when the sender owes the company the service fee for this order.</summary>
    public static bool SenderOwesService(Order o) => !RecipientPays(o);

    /// <summary>
    /// Service-fee value the company keeps for this order (i.e. not already inside the
    /// courier's cash handover):
    ///   • Recipient pays      → collected as cash by the courier, already counted inside
    ///                            <see cref="Order.CodTransferedToCompanyByCourier"/> → 0 here.
    ///   • Sender pays, netted  → the company retained the fee out of the COD it paid the
    ///                            customer (<see cref="Order.IsCompanyServicePriceIncludedSpecialCase"/>);
    ///                            the COD payout is stored at the full obligation, so the
    ///                            retained fee is counted back here → CompanyServicePrice.
    ///   • Sender pays, direct  → whatever the customer has actually paid the company.
    /// </summary>
    public static decimal ServiceInflow(Order o)
    {
        if (RecipientPays(o)) return 0m;
        if (o.IsCompanyServicePriceIncludedSpecialCase) return o.CompanyServicePrice;
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
    /// plus, for recipient-pays orders, the service fee collected at delivery. A billable failed
    /// delivery collected nothing (the recipient declined the parcel), so it is zero.
    /// </summary>
    public static decimal ExpectedCourierCash(Order o) =>
        IsBillableFailedDelivery(o)
            ? 0m
            : (o.AmountToCollectForPackage ?? 0m) + (RecipientPays(o) ? o.CompanyServicePrice : 0m);

    /// <summary>
    /// Package COD the company still owes the customer for this order. A billable failed delivery
    /// collected no COD (the parcel was never handed over), so nothing is owed back.
    /// </summary>
    public static decimal CodOwedToCustomer(Order o) =>
        IsBillableFailedDelivery(o)
            ? 0m
            : (o.AmountToCollectForPackage ?? 0m) - (o.CodPaidToCustomerAmount ?? 0m);

    /// <summary>
    /// Company service fee the sender still owes for this order (0 when the recipient pays it
    /// in cash at delivery). Counts the full fee on a billable failed delivery, less anything
    /// the sender has already paid.
    /// </summary>
    public static decimal ServiceOwedBySender(Order o) =>
        RecipientPays(o) ? 0m : o.CompanyServicePrice - (o.ServicePaidByCustomerAmount ?? 0m);

    /// <summary>True once the courier has been credited their full salary for this order.</summary>
    public static bool IsCourierSalaryPaid(Order o) =>
        (o.CourierSalary ?? 0m) - (o.CourierSalaryPaidAmount ?? 0m) <= Epsilon;

    /// <summary>
    /// True once the company service fee is fully settled. Always true when the recipient
    /// pays (collected in cash at delivery) or when it was netted out of the COD payout.
    /// </summary>
    public static bool IsCompanyServicePaid(Order o) =>
        RecipientPays(o)
        || o.IsCompanyServicePriceIncludedSpecialCase
        || o.CompanyServicePrice - (o.ServicePaidByCustomerAmount ?? 0m) <= Epsilon;

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
