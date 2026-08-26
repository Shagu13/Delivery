using Application.CustomerSettlements.DTOs;
using ClosedXML.Excel;

namespace API.Excel;

/// <summary>
/// Builds the Excel export shared by the customer and admin finance pages. Both callers pass
/// the exact <see cref="OrderFinanceLineDto"/> list the on-screen table is already rendering,
/// so the export can never drift from what the user is looking at.
/// </summary>
internal static class FinanceExcelBuilder
{
    // ── Georgian labels for the cell values the customer export localizes ──────────────
    // Mirrors client/src/utils/statusMeta.ts's `ka` short labels, client/src/api/orders.ts's
    // CANCELLATION_REASON_LABELS, and the order-type labels on the customer finance table.
    // Duplicated here (not shared) because this is server-side .NET and that's TypeScript —
    // keep both in sync if a status/reason label changes.
    private static readonly Dictionary<string, string> StatusKa = new()
    {
        ["Pending"]                              = "მოლოდინში",
        ["AcceptedGroupOrder"]                   = "მიღებულია",
        ["OrderNotAccepted"]                     = "არ მიღებულა",
        ["CourierAssignedToPickUp"]              = "კურიერი დაინიშნა",
        ["CourierDeliveringToWarehouse"]         = "საწყობისკენ",
        ["DeliveredToWarehouse"]                 = "საწყობშია",
        ["AdminAcceptedOrderInWareHouse"]        = "საწყობში",
        ["CancelledBySender"]                    = "გაუქმდა (მომხმარებელმა)",
        ["AcceptedOrder"]                        = "მიღებულია",
        ["OrderIsOnItsWayToRecipientsCity"]      = "გზაშია",
        ["CourierAssignedToDeliver"]             = "კურიერი დაინიშნა",
        ["CourierDeliveringTheOrderToRecipient"] = "მიტანის პროცესში",
        ["DeliveryPostponed"]                    = "გადადებულია",
        ["DeliveredToRecipient"]                 = "ჩაბარდა",
        ["CancelledByAdmin"]                     = "გაუქმდა (კომპანიამ)",
        ["AllDelivered"]                         = "ჩაბარდა სრულად",
        ["PickedUpFromRecipient"]                = "აღებულია",
        ["DeliveredReturnOrderToWarehouse"]      = "საწყობშია",
        ["ReturnedToSender"]                     = "დაბრუნდა",
        ["ExchangeCompleted"]                    = "გაცვლა შედგა",
    };

    private static readonly Dictionary<string, string> OrderTypeKa = new()
    {
        ["Send"]     = "გაგზავნა",
        ["Return"]   = "დაბრუნება",
        ["Exchange"] = "გაცვლა",
    };

    private static readonly Dictionary<string, string> CancellationReasonKa = new()
    {
        ["DidNotLike"]           = "არ მოეწონა",
        ["DidNotWant"]           = "აღარ სურდა",
        ["WrongSize"]            = "არასწორი ზომა",
        ["Other"]                = "სხვა",
        ["WarehouseNotReceived"] = "საწყობში ვერ მივიდა",
    };

    private static readonly Dictionary<string, string> WhoPaysKa = new()
    {
        ["Sender"]    = "გამგზავნი",
        ["Recipient"] = "მიმღები",
    };

    /// <param name="bankAccountLine">
    /// When set (the invoice export), rendered as its own merged row right under the title —
    /// e.g. "Bank Account: TBC Bank · Dilo LLC · GE29TB..." — so the reader knows where to pay
    /// without opening a separate page. Null for the plain finance export.
    /// </param>
    public static byte[] Build(
        IReadOnlyList<OrderFinanceLineDto> lines, string title, string lang = "en", string? bankAccountLine = null)
    {
        bool isGeo = lang == "ka";
        using XLWorkbook workbook = new();
        IXLWorksheet ws = workbook.Worksheets.Add("Finance");

        const int TotalCols = 16;

        // ── Title row ────────────────────────────────────────────────────────
        IXLCell titleCell = ws.Cell(1, 1);
        titleCell.Value = title;
        titleCell.Style.Font.Bold = true;
        titleCell.Style.Font.FontSize = 18;
        titleCell.Style.Font.FontColor = XLColor.White;
        titleCell.Style.Fill.BackgroundColor = XLColor.FromArgb(0x1A, 0x1A, 0x2E);
        titleCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        ws.Range(1, 1, 1, TotalCols).Merge();

        // ── Bank account row (invoice export only) ──────────────────────────
        int row = 3;
        if (bankAccountLine is not null)
        {
            IXLCell bankCell = ws.Cell(2, 1);
            bankCell.Value = bankAccountLine;
            bankCell.Style.Font.Bold = true;
            bankCell.Style.Font.FontSize = 12;
            bankCell.Style.Fill.BackgroundColor = XLColor.FromArgb(0xF3, 0xF4, 0xF6);
            bankCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Range(2, 1, 2, TotalCols).Merge();
            row = 4;
        }

        // ── Column headers ───────────────────────────────────────────────────
        // Mirrors the columns actually shown on the customer/admin finance tables (Recipient
        // split into City/District/Address for spreadsheet usability, plus Placed/Delivered
        // dates). Deliberately excludes CourierSalary — it's an internal figure never surfaced
        // on either finance page and must not leak into a customer's own export.
        string[] headers = isGeo
            ?
            [
                "#", "თრექინგ #", "მიმღები", "ქალაქი", "რაიონი", "მისამართი",
                "ტიპი", "სტატუსი", "გაუქმების მიზეზი",
                "ასაღები თანხა (₾)", "ასაღები გადახდილია", "მომსახურების საფასური (₾)", "ვინ იხდის მომსახურებას", "მომსახურება გადახდილია",
                "განთავსების თარიღი", "ჩაბარების თარიღი",
            ]
            :
            [
                "#", "Tracking #", "Recipient", "City", "District", "Address",
                "Type", "Status", "Cancellation Reason",
                "COD (₾)", "COD Paid", "Service Fee (₾)", "Who Pays Service", "Service Paid",
                "Placed", "Delivered",
            ];

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

        // ── Order rows ───────────────────────────────────────────────────────
        int firstDataRow = row;
        int orderNum = 1;
        foreach (OrderFinanceLineDto line in lines)
        {
            ws.Cell(row, 1).Value = orderNum++;
            ws.Cell(row, 2).Value = line.TrackingNumber;
            ws.Cell(row, 3).Value = line.RecipientName;
            ws.Cell(row, 4).Value = line.RecipientCity;
            ws.Cell(row, 5).Value = line.RecipientDistrict;
            ws.Cell(row, 6).Value = line.RecipientAddress;
            ws.Cell(row, 7).Value = isGeo ? OrderTypeKa.GetValueOrDefault(line.OrderType, line.OrderType) : line.OrderType;
            ws.Cell(row, 8).Value = isGeo ? StatusKa.GetValueOrDefault(line.Status, line.Status) : line.Status;
            ws.Cell(row, 9).Value = line.CancellationReason is null
                ? string.Empty
                : isGeo ? CancellationReasonKa.GetValueOrDefault(line.CancellationReason, line.CancellationReason) : line.CancellationReason;

            if (line.CodAmount.HasValue)
            {
                ws.Cell(row, 10).Value = line.CodAmount.Value;
                ws.Cell(row, 10).Style.NumberFormat.Format = "#,##0.00";
            }
            ws.Cell(row, 11).Value = line.IsCollectedCodPaidToCustomer ? (isGeo ? "კი" : "Yes") : (isGeo ? "არა" : "No");

            ws.Cell(row, 12).Value = line.CompanyServicePrice;
            ws.Cell(row, 12).Style.NumberFormat.Format = "#,##0.00";
            ws.Cell(row, 13).Value = isGeo ? WhoPaysKa.GetValueOrDefault(line.WhoPaysForCompanyService, line.WhoPaysForCompanyService) : line.WhoPaysForCompanyService;
            ws.Cell(row, 14).Value = line.IsCompanyServicePaid ? (isGeo ? "კი" : "Yes") : (isGeo ? "არა" : "No");

            ws.Cell(row, 15).Value = line.CreatedAt;
            ws.Cell(row, 16).Value = line.DeliveredAt ?? string.Empty;
            row++;
        }

        // ── Totals row ───────────────────────────────────────────────────────
        int lastDataRow = row - 1;
        ws.Cell(row, 2).Value = isGeo ? "სულ" : "TOTAL";
        ws.Cell(row, 2).Style.Font.Bold = true;

        if (lines.Count > 0)
        {
            ws.Cell(row, 10).FormulaA1 = $"=SUM(J{firstDataRow}:J{lastDataRow})";
            ws.Cell(row, 12).FormulaA1 = $"=SUM(L{firstDataRow}:L{lastDataRow})";
        }
        else
        {
            ws.Cell(row, 10).Value = 0m;
            ws.Cell(row, 12).Value = 0m;
        }

        foreach (int col in (int[])[2, 10, 12])
        {
            ws.Cell(row, col).Style.Font.Bold = true;
            ws.Cell(row, col).Style.Fill.BackgroundColor = XLColor.FromArgb(0xEE, 0xEE, 0xEE);
        }
        ws.Cell(row, 10).Style.NumberFormat.Format = "#,##0.00";
        ws.Cell(row, 12).Style.NumberFormat.Format = "#,##0.00";

        ws.Columns().AdjustToContents();
        ws.Column(6).Width = Math.Max(ws.Column(6).Width, 20);

        using MemoryStream ms = new();
        workbook.SaveAs(ms);
        return ms.ToArray();
    }
}
