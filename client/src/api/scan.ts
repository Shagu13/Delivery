const BASE = '/api/orders';

/** One scanned package — mirrors Application.Orders.Queries.ScanOrders.ScannedOrderDto. */
export interface ScannedOrder {
    orderId: string;
    trackingNumber: string;
    status: string;
    courierId: string | null;
    courierFullName: string | null;
    recipientName: string;
    recipientPhone: string;
    recipientCity: string;
    recipientDistrict: string;
    recipientAddress: string;
    description: string | null;
    isFragile: boolean;
    /** Cash the courier collects (server-side OrderFinance.ExpectedCourierCash). */
    amountToCollect: number;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
    const body = await res.json().catch(() => null);
    return body?.title ?? `${fallback} (${res.status})`;
}

/** Admin/Operator: look up a scanned barcode. Rejects (with the server's message) when the
 *  package is unknown, not assigned to a courier, or no longer out with one. */
export async function scanOrder(token: string, trackingNumber: string): Promise<ScannedOrder> {
    const res = await fetch(`${BASE}/scan/${encodeURIComponent(trackingNumber.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await errorMessage(res, 'Scan failed'));
    return res.json();
}

/** Admin/Operator: download the courier manifest Excel for the scanned tracking numbers.
 *  `courierId` set → that courier's file; omitted → one workbook with a sheet per courier. */
export async function exportScanManifest(
    token: string, trackingNumbers: string[], lang: string, courierId?: string,
): Promise<void> {
    const res = await fetch(`${BASE}/scan-export`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumbers, courierId: courierId ?? null, lang }),
    });
    if (!res.ok) throw new Error(await errorMessage(res, 'Export failed'));

    const blob        = await res.blob();
    const url         = URL.createObjectURL(blob);
    const disposition = res.headers.get('content-disposition') ?? '';
    const match       = /filename[^;=\n]*=(['"]?)([^;"'\n]*)\1/.exec(disposition);
    const anchor      = document.createElement('a');
    anchor.href       = url;
    anchor.download   = match?.[2]?.trim() || 'manifest.xlsx';
    anchor.click();
    URL.revokeObjectURL(url);
}
