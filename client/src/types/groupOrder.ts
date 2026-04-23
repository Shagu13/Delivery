export interface OrderItemRequest {
    recipientFirstName: string;
    recipientLastName: string;
    recipientPhone: string;
    recipientCity: string;
    recipientDistrict: string;
    recipientAddress: string;
    description?: string;
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