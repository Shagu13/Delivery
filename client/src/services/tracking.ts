export interface TrackingEvent {
    status: string;
    description: string;
    createdAt: string;
}

export interface TrackOrderResult {
    orderId: string;
    trackingNumber: string;
    status: string;
    recipientFirstName: string;
    recipientLastName: string;
    recipientCity: string;
    recipientDistrict: string;
    recipientAddress: string;
    courierFullName: string | null;
    warehouseName: string | null;
    createdAt: string;
    pickedUpFromWarehouseAt: string | null;
    deliveredAt: string | null;
    trackingEvents: TrackingEvent[];
}

export async function trackParcel(trackingNumber: string): Promise<TrackOrderResult> {
    const res = await fetch(`/api/orders/track/${encodeURIComponent(trackingNumber)}`);

    if (res.status === 404) {
        throw new Error('NOT_FOUND');
    }
    if (!res.ok) {
        throw new Error('SERVER_ERROR');
    }

    return res.json();
}