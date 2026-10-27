using Application.CompanyFinance.DTOs;
using ClosedXML.Excel;

namespace API.Excel;

/// <summary>
/// Excel export of the company finance overview's order list. Deliberately has NO courier salary or
/// margin column (margin = fee − salary would leak it): like <see cref="FinanceExcelBuilder"/>, this
/// file never surfaces courier pay. Labels reuse that builder's Georgian dictionaries.
/// </summary>
internal static class CompanyFinanceOrdersExcelBuilder
{
    public static byte[] Build(CompanyFinanceOrdersDto data, string lang = "en")
    {
        bool isGeo = lang == "ka";
        using XLWorkbook workbook = new();
        IXLWorksheet ws = workbook.Worksheets.Add("Orders");

        string[] headers = isGeo
            ?
            [
                "#", "თრექინგ #", "ჯგუფი", "თარიღი", "მომხმარებელი", "ქალაქი", "რაიონი", "კურიერი",
                "ტიპი", "სტატუსი", "გაუქმების მიზეზი", "ვინ იხდის მომსახურებას",
                "მომსახურების საფასური (₾)", "ასაღები თანხა (₾)",
            ]
            :
            [
                "#", "Tracking #", "Group", "Date", "Customer", "City", "District", "Courier",
                "Type", "Status", "Cancellation Reason", "Who Pays Service",
                "Service Fee (₾)", "COD (₾)",
            ];
        const int FeeCol = 13, CodCol = 14;

        IXLCell title = ws.Cell(1, 1);
        title.Value = isGeo
            ? $"შეკვეთები: {data.From} — {data.To}"
            : $"Orders: {data.From} — {data.To}";
        title.Style.Font.Bold = true;
        title.Style.Font.FontSize = 16;
        title.Style.Font.FontColor = XLColor.White;
        title.Style.Fill.BackgroundColor = XLColor.FromArgb(0x1A, 0x1A, 0x2E);
        title.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        ws.Range(1, 1, 1, headers.Length).Merge();

        int row = 3;
        for (int i = 0; i < headers.Length; i++)
        {
            IXLCell cell = ws.Cell(row, i + 1);
            cell.Value = headers[i];
            cell.Style.Font.Bold = true;
            cell.Style.Font.FontColor = XLColor.White;
            cell.Style.Fill.BackgroundColor = XLColor.FromArgb(0x1A, 0x1A, 0x2E);
            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        }
        row++;

        int firstDataRow = row;
        int n = 1;
        foreach (CompanyFinanceOrderDto o in data.Orders)
        {
            string type   = o.OrderType.ToString();
            string status = o.Status.ToString();
            string payer  = o.WhoPaysForCompanyService.ToString();
            string? reason = o.CancellationReason?.ToString();

            ws.Cell(row, 1).Value = n++;
            ws.Cell(row, 2).Value = o.TrackingNumber;
            ws.Cell(row, 3).Value = o.Group == CompanyFinanceOrderGroup.Delivered
                ? (isGeo ? "მიტანილი" : "Delivered")
                : (isGeo ? "ანაზღაურებადი წარუმატებელი" : "Billable failed");
            ws.Cell(row, 4).Value = o.EventAt?.ToString("yyyy-MM-dd HH:mm") ?? string.Empty;
            ws.Cell(row, 5).Value = o.CustomerName ?? string.Empty;
            ws.Cell(row, 6).Value = o.RecipientCity;
            ws.Cell(row, 7).Value = o.RecipientDistrict;
            ws.Cell(row, 8).Value = o.CourierName ?? string.Empty;
            ws.Cell(row, 9).Value  = isGeo ? FinanceExcelBuilder.OrderTypeKa.GetValueOrDefault(type, type) : type;
            ws.Cell(row, 10).Value = isGeo ? FinanceExcelBuilder.StatusKa.GetValueOrDefault(status, status) : status;
            ws.Cell(row, 11).Value = reason is null
                ? string.Empty
                : isGeo ? FinanceExcelBuilder.CancellationReasonKa.GetValueOrDefault(reason, reason) : reason;
            ws.Cell(row, 12).Value = isGeo ? FinanceExcelBuilder.WhoPaysKa.GetValueOrDefault(payer, payer) : payer;

            ws.Cell(row, FeeCol).Value = o.ServiceFee;
            ws.Cell(row, FeeCol).Style.NumberFormat.Format = "#,##0.00";
            if (o.Cod.HasValue)
            {
                ws.Cell(row, CodCol).Value = o.Cod.Value;
                ws.Cell(row, CodCol).Style.NumberFormat.Format = "#,##0.00";
            }
            row++;
        }

        // Totals — equal the overview's service revenue and COD for the same filters.
        int lastDataRow = row - 1;
        ws.Cell(row, 2).Value = isGeo ? "სულ" : "TOTAL";
        ws.Cell(row, 2).Style.Font.Bold = true;
        foreach (int col in new[] { FeeCol, CodCol })
        {
            string letter = col == FeeCol ? "M" : "N";
            if (data.Orders.Count > 0)
                ws.Cell(row, col).FormulaA1 = $"=SUM({letter}{firstDataRow}:{letter}{lastDataRow})";
            else
                ws.Cell(row, col).Value = 0m;
            ws.Cell(row, col).Style.NumberFormat.Format = "#,##0.00";
            ws.Cell(row, col).Style.Font.Bold = true;
            ws.Cell(row, col).Style.Fill.BackgroundColor = XLColor.FromArgb(0xEE, 0xEE, 0xEE);
        }

        ws.Columns().AdjustToContents();

        using MemoryStream ms = new();
        workbook.SaveAs(ms);
        return ms.ToArray();
    }
}
