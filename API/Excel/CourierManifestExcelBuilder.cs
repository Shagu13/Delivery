using Application.Orders.Queries.ScanOrders;
using ClosedXML.Excel;

namespace API.Excel;

/// <summary>
/// Builds the courier hand-off manifest from scanned packages: one worksheet per courier.
/// A single courier's file is just this workbook with one sheet, so "one file per courier" and
/// "download all" share the same code. Columns and order match the Couriers page export
/// (<c>CouriersController.ExportAssignedForCourier</c>) so both manifests read the same:
/// Date, Sender, City, District, Address, Recipient, Description/Comment, Phone, COD, Service Fee.
/// </summary>
internal static class CourierManifestExcelBuilder
{
    private static readonly string[] HeadersEn =
    {
        "Date", "Sender", "City", "District", "Address", "Recipient", "Description/Comment", "Phone", "COD", "Service Fee",
    };

    private static readonly string[] HeadersKa =
    {
        "თარიღი", "გამგზავნი", "ქალაქი", "სოფელი/უბანი", "მისამართი", "მიმღები", "აღწერა/კომენტარი", "საკონტაქტო", "ასაღები თანხა", "საკურიერო",
    };

    public static byte[] Build(IReadOnlyList<ScannedOrderDto> orders, string lang = "en")
    {
        bool isGeo = lang == "ka";
        string[] headers = isGeo ? HeadersKa : HeadersEn;

        using XLWorkbook workbook = new();
        HashSet<string> usedNames = new(StringComparer.OrdinalIgnoreCase);

        foreach (IGrouping<Guid?, ScannedOrderDto> group in orders.GroupBy(o => o.CourierId))
        {
            string courierName = group.First().CourierFullName ?? (isGeo ? "კურიერის გარეშე" : "Unassigned");
            IXLWorksheet ws = workbook.Worksheets.Add(SheetName(courierName, usedNames));

            for (int c = 0; c < headers.Length; c++)
                ws.Cell(1, c + 1).Value = headers[c];
            ws.Row(1).Style.Font.Bold = true;

            int row = 2;
            foreach (ScannedOrderDto o in group)
            {
                ws.Cell(row, 1).Value = o.CreatedAt;
                ws.Cell(row, 1).Style.DateFormat.Format = "dd.mm";
                ws.Cell(row, 2).Value = o.SenderName;
                ws.Cell(row, 3).Value = isGeo && !string.IsNullOrWhiteSpace(o.RecipientCityGeo) ? o.RecipientCityGeo : o.RecipientCity;
                ws.Cell(row, 4).Value = isGeo && !string.IsNullOrWhiteSpace(o.RecipientDistrictGeo) ? o.RecipientDistrictGeo : o.RecipientDistrict;
                ws.Cell(row, 5).Value = o.RecipientAddress;
                ws.Cell(row, 6).Value = o.RecipientName;
                ws.Cell(row, 7).Value = o.Description ?? string.Empty;
                ws.Cell(row, 8).Value = o.RecipientPhone;
                if (o.AmountToCollect > 0m) ws.Cell(row, 9).Value = o.AmountToCollect;
                ws.Cell(row, 10).Value = o.CompanyServicePrice;
                row++;
            }

            ws.Columns().AdjustToContents();
        }

        using MemoryStream ms = new();
        workbook.SaveAs(ms);
        return ms.ToArray();
    }

    // Excel sheet names: max 31 chars, none of \ / ? * [ ] :, and unique within the workbook.
    private static string SheetName(string courierName, HashSet<string> used)
    {
        string clean = new(courierName.Where(ch => !"\\/?*[]:".Contains(ch)).ToArray());
        clean = clean.Length > 28 ? clean[..28] : clean;
        if (clean.Length == 0) clean = "Courier";

        string name = clean;
        for (int i = 2; !used.Add(name); i++)
            name = $"{clean} {i}";
        return name;
    }
}
