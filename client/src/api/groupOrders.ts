import type { CreateGroupOrderRequest, CreateGroupOrderResponse, OrderItemRequest } from '../types/groupOrder';

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
): Promise<CreateGroupOrderResponse> {
    const response = await fetch('/api/grouporders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

/** Triggers a browser download of the blank Excel template. */
export async function downloadExcelTemplate(): Promise<void> {
    const response = await fetch('/api/grouporders/excel-template');
    if (!response.ok) throw new Error('Failed to download template.');

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'group-order-template.xlsx';
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