using Application.Couriers.Queries.CompletedByCourier;
using ClosedXML.Excel;

namespace API.Excel;

/// <summary>
/// Excel exports for the Couriers → Completed tab: one sheet of what couriers delivered (or failed to),
/// or one sheet of the pickup batches they brought to the warehouse. Courier salary is deliberately not
/// included — same rule as the other courier-facing manifests.
/// </summary>
internal static class CompletedCourierExcelBuilder
{
    private static readonly string[] DeliveryHeadersEn =
    {
        "Completed", "Courier", "Tracking", "Type", "Sender", "City", "District", "Address", "Recipient", "Phone", "COD", "Service Fee", "Result",
    };

    private static readonly string[] DeliveryHeadersKa =
    {
        "დასრულდა", "კურიერი", "თრექინგი", "ტიპი", "გამგზავნი", "ქალაქი", "სოფელი/უბანი", "მისამართი", "მიმღები", "საკონტაქტო", "ასაღები თანხა", "საკურიერო", "შედეგი",
    };

    private static readonly string[] PickupHeadersEn =
    {
        "Delivered to warehouse", "Courier", "Sender", "Phone", "City", "District", "Address", "Packages", "Picked up",
    };

    private static readonly string[] PickupHeadersKa =
    {
        "საწყობში ჩაბარდა", "კურიერი", "გამგზავნი", "საკონტაქტო", "ქალაქი", "სოფელი/უბანი", "მისამართი", "ამანათები", "აღებულია",
    };

    private static readonly Dictionary<string, string> ReasonsKa = new()
    {
        ["DidNotLike"] = "არ მოეწონა",
        ["WrongSize"]  = "ზომა არ ერგო",
        ["Other"]      = "სხვა",
    };

    public static byte[] BuildDeliveries(IReadOnlyList<CompletedDeliveryDto> items, string lang)
    {
        bool isGeo = lang == "ka";
        string[] headers = isGeo ? DeliveryHeadersKa : DeliveryHeadersEn;

        using XLWorkbook workbook = new();
        IXLWorksheet ws = workbook.Worksheets.Add(isGeo ? "დასრულებული" : "Completed");
        WriteHeader(ws, headers);

        int row = 2;
        foreach (CompletedDeliveryDto item in items)
        {
            Application.Orders.Queries.GetAllOrders.AdminOrderListDto o = item.Order;
            ws.Cell(row, 1).Value = item.CompletedAt;
            ws.Cell(row, 1).Style.DateFormat.Format = "dd.mm.yyyy hh:mm";
            ws.Cell(row, 2).Value = o.CourierFullName ?? string.Empty;
            ws.Cell(row, 3).Value = o.TrackingNumber;
            ws.Cell(row, 4).Value = o.OrderType;
            ws.Cell(row, 5).Value = o.SenderBusinessName;
            ws.Cell(row, 6).Value = isGeo && !string.IsNullOrWhiteSpace(o.RecipientCityGeo) ? o.RecipientCityGeo : o.RecipientCity;
            ws.Cell(row, 7).Value = isGeo && !string.IsNullOrWhiteSpace(o.RecipientDistrictGeo) ? o.RecipientDistrictGeo : o.RecipientDistrict;
            ws.Cell(row, 8).Value = o.RecipientAddress;
            ws.Cell(row, 9).Value = o.RecipientName;
            ws.Cell(row, 10).Value = o.RecipientPhone;
            // A failed attempt collected no cash, so no COD figure.
            if (!item.IsFailed && o.ExpectedCourierCash > 0m) ws.Cell(row, 11).Value = o.ExpectedCourierCash;
            ws.Cell(row, 12).Value = o.CompanyServicePrice;
            ws.Cell(row, 13).Value = ResultText(item, isGeo);
            row++;
        }

        ws.Columns().AdjustToContents();
        return Save(workbook);
    }

    public static byte[] BuildPickups(IReadOnlyList<CompletedPickupDto> items, string lang)
    {
        bool isGeo = lang == "ka";
        string[] headers = isGeo ? PickupHeadersKa : PickupHeadersEn;

        using XLWorkbook workbook = new();
        IXLWorksheet ws = workbook.Worksheets.Add(isGeo ? "პიკაპები" : "Pickups");
        WriteHeader(ws, headers);

        int row = 2;
        foreach (CompletedPickupDto p in items)
        {
            ws.Cell(row, 1).Value = p.DeliveredToWarehouseAt;
            ws.Cell(row, 1).Style.DateFormat.Format = "dd.mm.yyyy hh:mm";
            ws.Cell(row, 2).Value = p.CourierFullName;
            ws.Cell(row, 3).Value = p.SenderBusinessName;
            ws.Cell(row, 4).Value = p.SenderPhone;
            ws.Cell(row, 5).Value = p.PickUpCity;
            ws.Cell(row, 6).Value = p.PickUpDistrict;
            ws.Cell(row, 7).Value = p.PickUpAddress;
            ws.Cell(row, 8).Value = p.NumberOfPackages;
            if (p.PickedUpAt is DateTime pickedUp)
            {
                ws.Cell(row, 9).Value = pickedUp;
                ws.Cell(row, 9).Style.DateFormat.Format = "dd.mm.yyyy hh:mm";
            }
            row++;
        }

        ws.Columns().AdjustToContents();
        return Save(workbook);
    }

    private static string ResultText(CompletedDeliveryDto item, bool isGeo)
    {
        if (item.IsFailed)
        {
            string reason = item.FailureReason ?? string.Empty;
            if (isGeo && ReasonsKa.TryGetValue(reason, out string? ka)) reason = ka;
            return (isGeo ? "ვერ მიტანილი: " : "Failed: ") + reason;
        }
        if (item.Order.OrderType == "Return") return isGeo ? "საწყობში დაბრუნებული" : "Returned to warehouse";
        return isGeo ? "მიტანილი" : "Delivered";
    }

    private static void WriteHeader(IXLWorksheet ws, string[] headers)
    {
        for (int c = 0; c < headers.Length; c++)
            ws.Cell(1, c + 1).Value = headers[c];
        ws.Row(1).Style.Font.Bold = true;
    }

    private static byte[] Save(XLWorkbook workbook)
    {
        using MemoryStream ms = new();
        workbook.SaveAs(ms);
        return ms.ToArray();
    }
}
