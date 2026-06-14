using Application.CustomerSettlements.DTOs;
using Application.CustomerSettlements.Queries;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

public sealed class CustomerSettlementsController : BaseController
{
    // ── GET /api/customersettlements  (Admin) — a customer's batch invoices ───
    [HttpGet]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<CustomerSettlementDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetForCustomer(
        [FromQuery] Guid      customerId,
        [FromQuery] DateOnly? date,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetCustomerSettlementsQuery(customerId, date), ct);
        return Ok(result);
    }

    // ── GET /api/customersettlements/outstanding  (Admin) — all customers owing/owed ──
    [HttpGet("outstanding")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<CustomerOutstandingDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetOutstanding(CancellationToken ct)
    {
        var result = await Sender.Send(new GetCustomersWithOutstandingBalancesQuery(), ct);
        return Ok(result);
    }

    // ── GET /api/customersettlements/my  (Customer) — read-only ───────────────
    [HttpGet("my")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(typeof(IReadOnlyList<CustomerSettlementDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetMy(
        [FromQuery] DateOnly? date,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetMyCustomerSettlementsQuery(CurrentUserId, date), ct);
        return Ok(result);
    }

    // ── GET /api/customersettlements/{id}/invoice  (Customer) — Excel download ─
    [HttpGet("{id:guid}/invoice")]
    [Authorize(Roles = "Customer")]
    [Produces("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")]
    public async Task<IActionResult> DownloadInvoice(Guid id, CancellationToken ct)
    {
        SettlementInvoiceData data = await Sender.Send(
            new GetSettlementInvoiceDataQuery(id, CurrentUserId), ct);

        byte[] bytes    = BuildInvoiceExcel(data);
        string filename = $"Dilo-Invoice-{data.BatchCreatedAt:yyyy-MM-dd}.xlsx";
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename);
    }

    // ── Excel builder ─────────────────────────────────────────────────────────
    private static byte[] BuildInvoiceExcel(SettlementInvoiceData data)
    {
        using XLWorkbook workbook = new();
        IXLWorksheet ws = workbook.Worksheets.Add("Invoice");

        const int TotalCols = 15;

        // ── Title row ────────────────────────────────────────────────────────
        IXLCell title = ws.Cell(1, 1);
        title.Value = "DILO INVOICE";
        title.Style.Font.Bold = true;
        title.Style.Font.FontSize = 18;
        title.Style.Font.FontColor = XLColor.White;
        title.Style.Fill.BackgroundColor = XLColor.FromArgb(0x1A, 0x1A, 0x2E);
        title.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        ws.Range(1, 1, 1, TotalCols).Merge();

        // ── Batch summary ────────────────────────────────────────────────────
        int row = 3;

        static void Label(IXLWorksheet sheet, int r, int c, string text)
        {
            IXLCell cell = sheet.Cell(r, c);
            cell.Value = text;
            cell.Style.Font.Bold = true;
            cell.Style.Font.FontColor = XLColor.FromArgb(0x44, 0x44, 0x44);
        }

        static void Money(IXLWorksheet sheet, int r, int c, decimal value)
        {
            sheet.Cell(r, c).Value = value;
            sheet.Cell(r, c).Style.NumberFormat.Format = "#,##0.00";
        }

        Label(ws, row, 1, "Customer:");  ws.Cell(row, 2).Value = data.CustomerBusinessName; row++;
        Label(ws, row, 1, "Date:");      ws.Cell(row, 2).Value = data.BatchCreatedAt.ToString("yyyy-MM-dd"); row++;
        Label(ws, row, 1, "Type:");      ws.Cell(row, 2).Value = data.IsReturn ? "Return" : "Batch"; row++;
        row++; // blank

        decimal codPaid     = data.TotalCodCollected - data.OutstandingCod;
        decimal servicePaid = data.TotalServiceFee   - data.OutstandingService;

        Label(ws, row, 1, "COD Collected (₾):");     Money(ws, row, 2, data.TotalCodCollected);
        Label(ws, row, 4, "Service Fee Owed (₾):");  Money(ws, row, 5, data.TotalServiceFee); row++;

        Label(ws, row, 1, "COD Paid (₾):");           Money(ws, row, 2, codPaid);
        Label(ws, row, 4, "Service Fee Paid (₾):");   Money(ws, row, 5, servicePaid); row++;

        Label(ws, row, 1, "COD Outstanding (₾):");    Money(ws, row, 2, data.OutstandingCod);
        Label(ws, row, 4, "Service Outstanding (₾):"); Money(ws, row, 5, data.OutstandingService); row++;
        row++; // blank

        // ── Column headers ───────────────────────────────────────────────────
        string[] headers = ["#", "Tracking #", "Name", "Phone",
            "City", "District", "Address", "Type", "Status",
            "Payment", "Who Pays Service", "COD (₾)", "Service (₾)", "Delivered"];

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
        foreach (InvoiceOrderRow order in data.Orders)
        {
            ws.Cell(row,  1).Value = orderNum++;
            ws.Cell(row,  2).Value = order.TrackingNumber;
            ws.Cell(row,  3).Value = order.RecipientName;
            ws.Cell(row,  4).Value = order.RecipientPhone;
            ws.Cell(row,  5).Value = order.RecipientCity;
            ws.Cell(row,  6).Value = order.RecipientDistrict;
            ws.Cell(row,  7).Value = order.RecipientAddress;
            ws.Cell(row,  8).Value = order.OrderType;
            ws.Cell(row,  9).Value = order.Status;
            ws.Cell(row, 10).Value = order.ProductPaymentStatus;
            ws.Cell(row, 11).Value = order.WhoPaysServiceFee;
            if (order.CodAmount.HasValue)
            {
                ws.Cell(row, 12).Value = order.CodAmount.Value;
                ws.Cell(row, 12).Style.NumberFormat.Format = "#,##0.00";
            }
            ws.Cell(row, 13).Value = order.ServiceFee;
            ws.Cell(row, 13).Style.NumberFormat.Format = "#,##0.00";
            ws.Cell(row, 14).Value = order.DeliveredAt ?? string.Empty;
            row++;
        }

        // ── Totals row ───────────────────────────────────────────────────────
        int lastDataRow = row - 1;
        ws.Cell(row, 2).Value = "TOTAL";
        ws.Cell(row, 2).Style.Font.Bold = true;

        if (data.Orders.Count > 0)
        {
            ws.Cell(row, 12).FormulaA1 = $"=SUM(L{firstDataRow}:L{lastDataRow})";
            ws.Cell(row, 13).FormulaA1 = $"=SUM(M{firstDataRow}:M{lastDataRow})";
        }
        else
        {
            ws.Cell(row, 12).Value = 0m;
            ws.Cell(row, 13).Value = 0m;
        }

        foreach (int col in (int[])[2, 12, 13])
        {
            ws.Cell(row, col).Style.Font.Bold = true;
            ws.Cell(row, col).Style.Fill.BackgroundColor = XLColor.FromArgb(0xEE, 0xEE, 0xEE);
        }
        ws.Cell(row, 12).Style.NumberFormat.Format = "#,##0.00";
        ws.Cell(row, 13).Style.NumberFormat.Format = "#,##0.00";

        ws.Columns().AdjustToContents();
        ws.Column(7).Width = Math.Max(ws.Column(7).Width, 20);

        using MemoryStream ms = new();
        workbook.SaveAs(ms);
        return ms.ToArray();
    }
}
