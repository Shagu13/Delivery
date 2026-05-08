import type { PaymentStatus, ServicePayer } from '../api/adminGroupOrders';

export interface OrderItemRequest {
    recipientFirstName: string;
    recipientLastName: string;
    recipientPhone: string;
    recipientCity: string;
    /** The actual delivery district (sub-district when isDeliveryAddressInCityItself is true). */
    recipientDistrict: string;
    recipientAddress: string;
    description?: string;
    isFragile: boolean;
    productPaymentStatus: PaymentStatus;
    whoPaysForCompanyService: ServicePayer;
    /**
     * True when the customer selected City == District in the form
     * (e.g. City = "Tbilisi", District = "Tbilisi"), indicating the delivery
     * is within the city centre.  recipientDistrict then holds the sub-district
     * chosen in the third picker.
     *
     * Drives pricing tier on the backend:
     *   Tbilisi  + true  → CompanyServiceCapitalPrice
     *   Tbilisi  + false → CompanyServiceDistrictPrice
     *   Other    + true  → CompanyServiceCityPrice
     *   Other    + false → CompanyServiceDistrictPrice
     */
    isDeliveryAddressInCityItself: boolean;
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
