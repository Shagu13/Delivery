// ─── Payments API ─────────────────────────────────────────────────────────────

const BASE = '/api/payments';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CompanyServicePaymentStatus = 'Unpaid' | 'Pending' | 'Paid';
export type PaymentRequestStatus        = 'Pending' | 'Confirmed' | 'PartiallyPaid';
export type PaymentRequestType          =
  | 'SenderPaysCompany'
  | 'CompanyPaysSender'
  | 'CompanyPaysCourier'
  | 'CourierHandsOverRevenue';

export interface PaymentOrderItem {
  orderId:                    string;
  trackingNumber:             string;
  recipientFirstName:         string;
  recipientCity:              string;
  recipientDistrict:          string;
  companyServicePrice:        number;
  amountOfCashCollected:      number | null;
  amountToCollectForPackage:  number | null;
  status:                     string;
  companyServicePaymentStatus: CompanyServicePaymentStatus;
  hasCompanyPaidTheSender:    boolean;
  createdAt:                  string;
  deliveredAt:                string | null;
}

// ── Admin types ───────────────────────────────────────────────────────────────

export interface AdminSenderPaymentRequest {
  paymentRequestId:     string;
  customerId:           string;
  customerBusinessName: string;
  customerPhone:        string;
  totalAmount:          number;
  amountConfirmed:      number;
  status:               PaymentRequestStatus;
  note:                 string | null;
  createdAt:            string;
  confirmedAt:          string | null;
  orders:               PaymentOrderItem[];
}

export interface AdminUnpaidSenderGroup {
  customerId:           string;
  customerBusinessName: string;
  customerPhone:        string;
  totalUnpaid:          number;
  orderCount:           number;
}

export interface AdminCollectFromSenders {
  pendingRequests: AdminSenderPaymentRequest[];
  unpaidGroups:    AdminUnpaidSenderGroup[];
}

export interface AdminCodOwedToSender {
  customerId:           string;
  customerBusinessName: string;
  customerPhone:        string;
  totalCodOwed:         number;
  orders:               PaymentOrderItem[];
}

export interface AdminCourierSettlement {
  settlementId:                string;
  courierId:                   string;
  courierFullName:             string;
  courierPhone:                string;
  settlementDate:              string;
  totalOrdersDelivered:        number;
  totalOrdersPickedUp:         number;
  totalCourierSalary:          number;
  totalCourierTransferToCompany: number;
  totalCompanyServiceRevenue:  number;
  totalCompanyNetIncome:       number;
  totalAmountOfCashCollected:  number | null;
  isTheDayClosed:              boolean;
  wasCourierPaid:              boolean;
  courierPaidAt:               string | null;
  hasCourierHandedOverRevenue: boolean;
  revenueHandedOverAt:         string | null;
}

export interface AdminPaymentsPage {
  collectFromSenders: AdminCollectFromSenders;
  payToSenders:       AdminCodOwedToSender[];
  courierSettlements: AdminCourierSettlement[];
}

// ── Customer types ────────────────────────────────────────────────────────────

export interface CustomerServiceFeeOrder {
  orderId:                    string;
  trackingNumber:             string;
  recipientFirstName:         string;
  recipientCity:              string;
  recipientDistrict:          string;
  companyServicePrice:        number;
  orderStatus:                string;
  companyServicePaymentStatus: CompanyServicePaymentStatus;
  paymentRequestId:           string | null;
  createdAt:                  string;
  deliveredAt:                string | null;
}

export interface CustomerPaymentRequestSummary {
  paymentRequestId: string;
  totalAmount:      number;
  amountConfirmed:  number;
  status:           PaymentRequestStatus;
  createdAt:        string;
  confirmedAt:      string | null;
  orderCount:       number;
}

export interface CustomerCodIncomeOrder {
  orderId:                 string;
  trackingNumber:          string;
  recipientFirstName:      string;
  recipientCity:           string;
  amountCollected:         number;
  orderStatus:             string;
  hasCompanyPaidTheSender: boolean;
  deliveredAt:             string | null;
}

export interface CustomerPaymentsPage {
  serviceFeeOrders:       CustomerServiceFeeOrder[];
  paymentRequests:        CustomerPaymentRequestSummary[];
  codIncomeOrders:        CustomerCodIncomeOrder[];
  totalServiceFeeUnpaid:  number;
  totalServiceFeePending: number;
  totalServiceFeePaid:    number;
  totalCodPending:        number;
  totalCodReceived:       number;
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function getAdminPayments(
  token: string,
  settlementFrom?: string,
): Promise<AdminPaymentsPage> {
  const params = settlementFrom
    ? `?settlementFrom=${encodeURIComponent(settlementFrom)}`
    : '';
  const res = await fetch(`${BASE}/admin${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function confirmSenderPayment(
  token: string,
  paymentRequestId: string,
  amountReceived: number,
  note?: string,
): Promise<void> {
  const res = await fetch(`${BASE}/admin/confirm-sender`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ paymentRequestId, amountReceived, note: note ?? null }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function markCompanyPaidSenderCod(
  token:      string,
  customerId: string,
  orderIds:   string[],
  note?:      string,
): Promise<void> {
  const res = await fetch(`${BASE}/admin/pay-sender-cod`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ customerId, orderIds, note: note ?? null }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function markSettlementEvent(
  token:             string,
  dailySettlementId: string,
  eventType:         'CompanyPaysCourier' | 'CourierHandsOverRevenue',
  note?:             string,
): Promise<void> {
  const res = await fetch(`${BASE}/admin/settlement-event`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ dailySettlementId, eventType, note: note ?? null }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function getMyPayments(
  token: string,
  year:  number,
  month: number,
): Promise<CustomerPaymentsPage> {
  const res = await fetch(`${BASE}/my?year=${year}&month=${month}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createPaymentRequest(
  token:    string,
  orderIds: string[],
  note?:    string,
): Promise<string> {
  const res = await fetch(`${BASE}/my/request`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ orderIds, note: note ?? null }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.paymentRequestId;
}
