// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminFinanceSummary {
  year:                    number;
  month:                   number;
  grossServiceRevenue:     number;
  totalCourierSalaries:    number;
  netServiceIncome:        number;
  totalCodCollected:       number;
  totalCodPaidToSenders:   number;
  totalCodOwedToSenders:   number;
  totalReceivedFromSenders: number;
  totalCourierHandovers:   number;
  totalCourierSalaryPaid:  number;
  totalOrdersDelivered:    number;
  totalSettlementsCreated: number;
}

export interface FinanceLedgerEntry {
  id:               string;
  type:             'SenderPaysCompany' | 'CompanyPaysSender' | 'CompanyPaysCourier' | 'CourierHandsOverRevenue';
  direction:        'In' | 'Out';
  amount:           number;
  status:           string;
  counterpartyName: string | null;
  note:             string | null;
  createdAt:        string;
  confirmedAt:      string | null;
}

export interface CompanyCashBalance {
  cashIn:  number;
  cashOut: number;
  balance: number;
}

export interface AdminFinancePage {
  monthlySummaries:  AdminFinanceSummary[];
  ledgerEntries:     FinanceLedgerEntry[];
  totalLedgerCount:  number;
  page:              number;
  pageSize:          number;
  cashBalance:       CompanyCashBalance;
}

export type LedgerTypeFilter =
  | ''
  | 'SenderPaysCompany'
  | 'CompanyPaysSender'
  | 'CompanyPaysCourier'
  | 'CourierHandsOverRevenue';

// ── API call ──────────────────────────────────────────────────────────────────

export async function getAdminFinanceSummary(
  token:       string,
  monthsBack:  number        = 6,
  page:        number        = 0,
  pageSize:    number        = 30,
  type:        LedgerTypeFilter = '',
): Promise<AdminFinancePage> {
  const params = new URLSearchParams({
    monthsBack: String(monthsBack),
    page:       String(page),
    pageSize:   String(pageSize),
  });
  if (type) params.set('type', type);

  const res = await fetch(`/api/finance/summary?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Finance summary fetch failed: ${res.status}`);
  return res.json();
}

export interface UnpaidFeeOrder {
  orderId:                    string;
  trackingNumber:             string;
  customerId:                 string | null;
  senderFirstName:            string;
  senderLastName:             string;
  senderBusinessName:         string;
  senderPhone:                string;
  customerPhone:              string | null;
  recipientFirstName:         string;
  recipientLastName:          string;
  recipientPhone:             string;
  recipientCity:              string;
  companyServicePrice:        number;
  whoPaysForCompanyService:   'Sender' | 'Recipient';
  companyServicePaymentStatus: 'Unpaid' | 'Pending';
  orderStatus:                string;
  deliveredAt:                string | null;
  createdAt:                  string;
}

export async function getUnpaidFeeOrders(token: string): Promise<UnpaidFeeOrder[]> {
  const res = await fetch('/api/finance/unpaid-fees', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to load unpaid fees: ${res.status}`);
  return res.json();
}
