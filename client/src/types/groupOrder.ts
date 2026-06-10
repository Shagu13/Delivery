import type { PaymentStatus, ServicePayer } from '../api/adminGroupOrders';

export type OrderType = 'Send' | 'Return' | 'Exchange';

export interface OrderItemRequest {
    recipientFirstName: string;
    recipientLastName: string;
    recipientPhone: string;
    recipientCity: string;
    /** The delivery district. */
    recipientDistrict: string;
    recipientAddress: string;
    description?: string;
    isFragile: boolean;
    productPaymentStatus: PaymentStatus;
    whoPaysForCompanyService: ServicePayer;
    /** Order type: Send (default), Return, or Exchange. */
    orderType: OrderType;
    /** Required when orderType === 'Return'. Address where courier collects the parcel. */
    returnPickupAddress?: string;
    returnPickupCity?: string;
    returnPickupDistrict?: string;
    /**
     * Cash amount the courier must collect from the recipient for the product (COD).
     * Only required when productPaymentStatus === 'NotPaid' AND whoPaysForCompanyService === 'Recipient'.
     */
    amountToCollectForPackage?: number;
    companyServicePrice?: number;     // admin override — omit to use auto-pricing
    weightPriceTierId?: string;       // selected weight tier — drives pricing on the backend
    /** Exact coordinates captured when an address suggestion is picked; null/undefined when typed manually. */
    latitude?: number | null;
    longitude?: number | null;
}

export interface CreateGroupOrderRequest {
    senderFirstName: string;
    senderLastName: string;
    senderIdNumber?: string;
    senderBusinessName: string;
    senderPhone: string;
    pickUpCity: string;
    pickUpDistrict: string;
    pickUpAddress: string;
    note?: string;
    orders: OrderItemRequest[];
    customerId?: string;
}

export interface OrderTrackingResponse {
    orderId: string;
    trackingNumber: string;
    recipientFirstName: string;
    recipientLastName: string;
}

export interface CreateGroupOrderResponse {
    groupOrderId: string;
    senderBusinessName: string;
    orders: OrderTrackingResponse[];
}

export interface ValidationErrors {
    [key: string]: string;
}
