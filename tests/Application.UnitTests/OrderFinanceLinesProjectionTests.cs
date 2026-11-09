using Application.CustomerSettlements.DTOs;
using Application.CustomerSettlements.Queries;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.UnitTests;

/// <summary>
/// The finance-lines reads load slim orders through <c>OrderFinanceQueries.LineFields</c> instead of
/// whole entities. Every field ToDto (and the OrderFinance members it calls) reads is set to a
/// non-default value here, so a column missing from the projection makes the two DTOs differ.
/// </summary>
public sealed class OrderFinanceLinesProjectionTests
{
    private static AppDbContext Ctx(string db) =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(db).Options);

    private static Customer Cust(string name) => new()
    {
        FirstName = "F", LastName = "L", BusinessName = name, PhoneNumber = name + "-ph",
        City = "Tbilisi", District = "Vake", Address = "A",
    };

    private static Order FullyPopulated(string tn, ServicePayer payer, DateTime now) => new()
    {
        TrackingNumber                           = tn,
        RecipientName                            = "Recipient " + tn,
        RecipientPhone                           = "555" + tn,
        RecipientCity                            = "Tbilisi",
        RecipientDistrict                        = "Saburtalo",
        RecipientAddress                         = "Street " + tn,
        Description                              = "desc",
        Status                                   = OrderStatus.DeliveredToRecipient,
        ProductPaymentStatus                     = PaymentStatus.Paid,
        CreatedAt                                = now.AddDays(-2),
        DeliveredAt                              = now,
        DeliveredToWarehouseAt                   = now.AddDays(-1),
        CancelledAt                              = now.AddHours(-1),
        CancellationComment                      = "cc",
        PostponeComment                          = "pc",
        WhoPaysForCompanyService                 = payer,
        AmountToCollectForPackage                = 120m,
        IsCollectedCodPaidToCustomer             = true,
        CodPaidToCustomerAmount                  = 70m,
        CodPaidToCustomerAt                      = now,
        CompanyServicePrice                      = 8m,
        CustomerSurcharge                        = payer == ServicePayer.Recipient ? 1m : 0m,
        CompanyServicePaymentStatus              = CompanyServicePaymentStatus.Pending,
        ServicePaidByCustomerAmount              = 0.5m,
        ServicePaidByCustomerAt                  = now,
        CourierSalary                            = 4m,
        CourierSalaryPaidAmount                  = 1.5m,
        CourierSalaryPaidAt                      = now,
        AmountOfCashCollected                    = 127m,
        CodTransferedToCompanyByCourier          = 60m,
        CodTransferedToCompanyByCourierAt        = now,
        IsCourierSalaryIncludedSpecialCase       = true,
        IsCompanyServicePriceIncludedSpecialCase = true,
    };

    [Fact]
    public async Task LineFields_ProducesTheSameDtos_AsFullEntities()
    {
        string db = Guid.NewGuid().ToString();
        DateTime now = CustomTime.Now;

        using (AppDbContext seed = Ctx(db))
        {
            Customer batchOwner  = Cust("Batch Biz");
            Customer returnOwner = Cust("Return Biz");
            GroupOrder batch = new()
            {
                Customer = batchOwner, Note = "batch note",
                SenderFirstName = "S", SenderLastName = "L", SenderBusinessName = "Batch Biz",
                SenderPhone = "1", PickUpCity = "Tbilisi", PickUpDistrict = "Vake", PickUpAddress = "P",
            };

            Order inBatch = FullyPopulated("TN-BATCH", ServicePayer.Recipient, now);
            inBatch.GroupOrder = batch;

            Order failed = FullyPopulated("TN-FAILED", ServicePayer.Sender, now);
            failed.GroupOrder         = batch;
            failed.Status             = OrderStatus.CancelledByAdmin;
            failed.CancellationReason = CancellationReason.Other;

            Order standaloneReturn = FullyPopulated("TN-RETURN", ServicePayer.Sender, now);
            standaloneReturn.OrderType = OrderType.Return;
            standaloneReturn.Customer  = returnOwner;
            standaloneReturn.Status    = OrderStatus.ReturnedToSender;

            seed.Orders.AddRange(inBatch, failed, standaloneReturn);
            await seed.SaveChangesAsync();
        }

        using AppDbContext ctx = Ctx(db);
        List<OrderFinanceLineDto> full = (await ctx.Orders.AsNoTracking()
                .Include(o => o.GroupOrder)!.ThenInclude(g => g!.Customer)
                .Include(o => o.Customer)
                .OrderBy(o => o.TrackingNumber)
                .ToListAsync())
            .Select(OrderFinanceQueries.ToDto).ToList();
        List<OrderFinanceLineDto> slim = (await ctx.Orders.AsNoTracking()
                .OrderBy(o => o.TrackingNumber)
                .LineFields()
                .ToListAsync())
            .Select(OrderFinanceQueries.ToDto).ToList();

        Assert.Equal(3, full.Count);
        Assert.Equal(full, slim);
        Assert.Contains(slim, l => l.CustomerBusinessName == "Return Biz" && l.IsReturn);
        Assert.Contains(slim, l => l.OrderNote == "batch note");
    }
}
