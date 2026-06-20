import type { CreateGroupOrderRequest, CreateGroupOrderResponse, OrderItemRequest } from '../types/groupOrder';
import type { Lang } from '../contexts/translations';

export class ApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly errors?: Record<string, string[]>,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

export async function createGroupOrder(
    data: CreateGroupOrderRequest,
    token: string,
): Promise<CreateGroupOrderResponse> {
    const response = await fetch('/api/grouporders', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new ApiError(
            response.status,
            body?.title ?? `Request failed with status ${response.status}`,
            body?.errors,
        );
    }

    return response.json() as Promise<CreateGroupOrderResponse>;
}

/**
 * Places the customer's cart. The backend creates a single standalone order when the
 * cart holds one package, or one group order when it holds several.
 */
export async function checkoutCart(
    data: CreateGroupOrderRequest,
    token: string,
): Promise<CreateGroupOrderResponse> {
    const response = await fetch('/api/grouporders/checkout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new ApiError(
            response.status,
            body?.title ?? `Request failed with status ${response.status}`,
            body?.errors,
        );
    }

    return response.json() as Promise<CreateGroupOrderResponse>;
}

/** Appends packages to an existing open batch (GroupOrder) owned by the customer. */
export async function addOrdersToBatch(
    batchId: string,
    orders: OrderItemRequest[],
    token: string,
): Promise<CreateGroupOrderResponse> {
    const response = await fetch(`/api/grouporders/${batchId}/orders`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ orders }),
    });

    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new ApiError(
            response.status,
            body?.title ?? `Request failed with status ${response.status}`,
            body?.errors,
        );
    }

    return response.json() as Promise<CreateGroupOrderResponse>;
}

/** Triggers a browser download of the blank Excel template in the given language. */
export async function downloadExcelTemplate(lang: Lang = 'en'): Promise<void> {
    const response = await fetch(`/api/grouporders/excel-template?lang=${lang}`);
    if (!response.ok) throw new Error('Failed to download template.');

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = lang === 'ka' ? 'შეკვეთის-შაბლონი.xlsx' : 'group-order-template.xlsx';
    anchor.click();
    URL.revokeObjectURL(url);
}

/** Uploads an .xlsx file and returns the parsed recipient rows. */
export async function parseGroupOrderExcel(file: File): Promise<OrderItemRequest[]> {
    const form = new FormData();
    form.append('file', file);

    const response = await fetch('/api/grouporders/parse-excel', {
        method: 'POST',
        body: form,
    });

    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new ApiError(
            response.status,
            body?.title ?? `Failed to parse file (${response.status})`,
            body?.errors,
        );
    }

    return response.json() as Promise<OrderItemRequest[]>;
}