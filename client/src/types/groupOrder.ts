import type { PaymentStatus, ServicePayer } from '../api/adminGroupOrders';

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
    companyServicePrice?: number; // admin override — omit to use auto-pricing
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
