using System.Globalization;
using Application.Common.Exceptions;
using Application.Finance;
using Domain;
using Domain.Enums;
using FluentValidation.Results;

namespace Application.Orders.Commands.ChangeOrderPayer;

/// <summary>What <see cref="OrderPayerChangePolicy.Apply"/> did to the order, plus the receipt trims the caller must persist.</summary>
internal sealed record PayerChangeComputation(
    IReadOnlyList<PayerChangeLine> Lines,
    IReadOnlyList<PayerChangeWarning> Warnings,
    IReadOnlyDictionary<PaymentReceiptFlow, decimal> ReceiptTrims);

/// <summary>
/// The one rule for flipping who pays the company service fee on an ALREADY-DELIVERED order, shared by the
/// admin preview and the command so they can never disagree. It mutates the (tracked or untracked) order,
/// derives every figure through <see cref="OrderFinance"/>, and reports each consequence.
///
/// <para>What follows from the flip, in settlement order:</para>
/// <list type="number">
/// <item><b>Fee &amp; COD</b> — new payer and fee; the surcharge resets to 0. For an all-in order the gross the
///   recipient hands over stays constant and only the fee slice moves.</item>
/// <item><b>Cash collected</b> — re-derived with <see cref="OrderFinance.DeliveredCashCollected"/>: a recipient
///   now pays the fee to the courier at the door; a sender no longer does.</item>
/// <item><b>The sender's fee payment</b> — capped at the sender's new share (<see cref="OrderFinance.SenderServiceShare"/>).
///   A fee that was netted out of the COD payout is un-netted (the payout shrinks by the retained amount, so
///   the company shows it owes it back); direct payments are trimmed with their receipts.</item>
/// <item><b>The tenant's fee payment</b> — capped the same way (tenant tier).</item>
/// <item><b>Courier cash</b> — the cash already handed over is capped at what the new payer allows
///   (<c>expected cash − salary kept</c>), and the salary-kept flag follows the new payer.</item>
/// </list>
/// Money that physically changed hands is never invented: it is only ever reduced to what is still valid, and the
/// admin is warned about each reduction so any refund can be settled outside the system.
/// </summary>
internal static class OrderPayerChangePolicy
{
    private const decimal Epsilon = 0.005m;

    public static void EnsureEligible(Order order, ServicePayer newPayer)
    {
        if (order.Status != OrderStatus.DeliveredToRecipient || order.OrderType != OrderType.Send)
            throw new ConflictException("Only delivered Send orders can have their service-fee payer changed.");

        if (OrderFinance.IsBillableFailedDelivery(order))
            throw new ConflictException("A billable failed delivery is always charged to the sender.");

        if (order.WhoPaysForCompanyService == newPayer)
            throw new ConflictException($"The {newPayer} already pays the service fee for this order.");
    }

    public static PayerChangeComputation Apply(Order order, ServicePayer newPayer, decimal newFee)
    {
        EnsureEligible(order, newPayer);

        IReadOnlyList<(string Field, string? Value)> before = Describe(order);
        Dictionary<PaymentReceiptFlow, decimal> trims = new();
        List<PayerChangeWarning> warnings = new();

        decimal oldFee          = order.CompanyServicePrice;
        decimal oldExpectedCash = OrderFinance.ExpectedCourierCash(order);

        // ── 1. Payer, fee, COD ────────────────────────────────────────────────
        if (order.IsCompanyServicePriceIncluded && order.AmountToCollectForPackage is decimal product)
        {
            // All-in order: the stored COD is the product only. Keep the all-in total constant.
            decimal gross = product + oldFee;
            if (gross < newFee)
            {
                throw new Common.Exceptions.ValidationException(new[]
                {
                    new ValidationFailure(nameof(newFee),
                        $"The all-in price ({gross:0.##}) is less than the service fee ({newFee:0.##}).")
                });
            }
            order.AmountToCollectForPackage = gross - newFee;
        }

        order.WhoPaysForCompanyService = newPayer;
        order.CompanyServicePrice      = newFee;
        order.CustomerSurcharge        = 0m;
        if (order.CourierSalary.HasValue)
            order.CompanyRevenue = newFee - order.CourierSalary.Value;

        // ── 2. Cash the courier collected at the door ─────────────────────────
        order.AmountOfCashCollected = OrderFinance.DeliveredCashCollected(order);

        // ── 3. The sender's fee payment ───────────────────────────────────────
        decimal senderShare = OrderFinance.SenderServiceShare(order);

        if (order.IsCompanyServicePriceIncludedSpecialCase)
        {
            // The fee was settled by keeping it out of the COD payout. Undo that: the payout shrinks by the
            // retained amount, so the company shows it still owes it to the customer.
            decimal netted  = order.ServicePaidByCustomerAmount ?? 0m;
            decimal codPaid = order.CodPaidToCustomerAmount ?? 0m;
            decimal restore = Math.Min(netted, codPaid);
            if (restore > Epsilon)
            {
                order.CodPaidToCustomerAmount = codPaid - restore > Epsilon ? codPaid - restore : null;
                if (order.CodPaidToCustomerAmount is null) order.CodPaidToCustomerAt = null;
                order.IsCollectedCodPaidToCustomer = (order.CodPaidToCustomerAmount ?? 0m) > Epsilon;
                trims[PaymentReceiptFlow.CodPayout] = restore;
                warnings.Add(new PayerChangeWarning("CodPayoutReducedByNetting", restore));
            }

            order.IsCompanyServicePriceIncludedSpecialCase = false;
            order.ServicePaidByCustomerAmount = null;
            order.ServicePaidByCustomerAt     = null;
        }
        else
        {
            decimal paid = order.ServicePaidByCustomerAmount ?? 0m;
            decimal keep = Math.Min(paid, senderShare);
            if (paid - keep > Epsilon)
            {
                trims[PaymentReceiptFlow.ServiceFee] = paid - keep;
                warnings.Add(new PayerChangeWarning("SenderServicePaymentReversed", paid - keep));
                order.ServicePaidByCustomerAmount = keep > Epsilon ? keep : null;
                if (order.ServicePaidByCustomerAmount is null) order.ServicePaidByCustomerAt = null;
            }
        }

        order.CompanyServicePaymentStatus = OrderFinance.ServicePaymentStatus(order);

        // ── 4. The tenant's fee payment (tenant tier, no receipts) ────────────
        decimal tenantPaid  = order.ServicePaidByTenantAmount ?? 0m;
        decimal tenantShare = OrderFinance.SenderServiceShareOf(newPayer, newFee, 0m);
        if (tenantPaid - tenantShare > Epsilon)
        {
            warnings.Add(new PayerChangeWarning("TenantServicePaymentReversed", tenantPaid - tenantShare));
            order.ServicePaidByTenantAmount = tenantShare > Epsilon ? tenantShare : null;
            if (order.ServicePaidByTenantAmount is null) order.ServicePaidByTenantAt = null;
        }

        // ── 5. Courier cash ───────────────────────────────────────────────────
        // A recipient-pays courier keeps their salary out of the collected cash — unless the company already
        // paid that salary separately, in which case the courier still owes the whole collected amount.
        bool salaryPaidSeparately = (order.CourierSalaryPaidAmount ?? 0m) > Epsilon
                                 && !order.IsCourierSalaryIncludedSpecialCase;
        decimal keptSalary  = newPayer == ServicePayer.Recipient && !salaryPaidSeparately
            ? order.CourierSalary ?? 0m
            : 0m;
        decimal newExpected = OrderFinance.ExpectedCourierCash(order);
        decimal maxTransfer = Math.Max(0m, newExpected - keptSalary);
        decimal transferred = order.CodTransferedToCompanyByCourier ?? 0m;

        if (transferred - maxTransfer > Epsilon)
        {
            trims[PaymentReceiptFlow.CourierCodTransfer] = transferred - maxTransfer;
            warnings.Add(new PayerChangeWarning("CourierTransferReduced", transferred - maxTransfer));
            order.CodTransferedToCompanyByCourier = maxTransfer > Epsilon ? maxTransfer : null;
            if (order.CodTransferedToCompanyByCourier is null) order.CodTransferedToCompanyByCourierAt = null;
        }

        // The salary-kept flag mirrors the courier settlement commands: it follows the payer once cash was handed over.
        if (newPayer == ServicePayer.Sender)
            order.IsCourierSalaryIncludedSpecialCase = false;
        else if ((order.CodTransferedToCompanyByCourier ?? 0m) > Epsilon && !salaryPaidSeparately)
            order.IsCourierSalaryIncludedSpecialCase = true;

        if (newExpected - oldExpectedCash > Epsilon)
            warnings.Add(new PayerChangeWarning("CourierOwesMoreCash", newExpected - oldExpectedCash));

        // A COD payout already made can exceed an all-in order's new, smaller product price.
        decimal codOver = (order.CodPaidToCustomerAmount ?? 0m) - (order.AmountToCollectForPackage ?? 0m);
        if (codOver > Epsilon)
            warnings.Add(new PayerChangeWarning("CodPayoutExceedsCod", codOver));

        return new PayerChangeComputation(Diff(before, Describe(order)), warnings, trims);
    }

    // ── Diff ─────────────────────────────────────────────────────────────────

    private static IReadOnlyList<(string Field, string? Value)> Describe(Order o) => new (string, string?)[]
    {
        (nameof(Order.WhoPaysForCompanyService),                    o.WhoPaysForCompanyService.ToString()),
        (nameof(Order.CompanyServicePrice),                         Money(o.CompanyServicePrice)),
        (nameof(Order.CustomerSurcharge),                           Money(o.CustomerSurcharge)),
        (nameof(Order.AmountToCollectForPackage),                   Money(o.AmountToCollectForPackage)),
        (nameof(Order.AmountOfCashCollected),                       Money(o.AmountOfCashCollected)),
        (nameof(Order.CompanyRevenue),                              Money(o.CompanyRevenue)),
        (nameof(Order.CompanyServicePaymentStatus),                 o.CompanyServicePaymentStatus.ToString()),
        (nameof(Order.ServicePaidByCustomerAmount),                 Money(o.ServicePaidByCustomerAmount)),
        (nameof(Order.IsCompanyServicePriceIncludedSpecialCase),    o.IsCompanyServicePriceIncludedSpecialCase ? "true" : "false"),
        (nameof(Order.CodPaidToCustomerAmount),                     Money(o.CodPaidToCustomerAmount)),
        (nameof(Order.CodTransferedToCompanyByCourier),             Money(o.CodTransferedToCompanyByCourier)),
        (nameof(Order.IsCourierSalaryIncludedSpecialCase),          o.IsCourierSalaryIncludedSpecialCase ? "true" : "false"),
        (nameof(Order.ServicePaidByTenantAmount),                   Money(o.ServicePaidByTenantAmount)),
    };

    private static List<PayerChangeLine> Diff(
        IReadOnlyList<(string Field, string? Value)> before,
        IReadOnlyList<(string Field, string? Value)> after)
    {
        List<PayerChangeLine> lines = new();
        for (int i = 0; i < before.Count; i++)
        {
            if (before[i].Value != after[i].Value)
                lines.Add(new PayerChangeLine(before[i].Field, before[i].Value, after[i].Value));
        }
        return lines;
    }

    private static string? Money(decimal? v) => v?.ToString("0.00", CultureInfo.InvariantCulture);
}
