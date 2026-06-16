# Delivery — Partner API Integration Guide

This guide explains how a business partner integrates with our delivery platform.
Your system pushes orders to us over HTTPS; our couriers pick up and deliver; you
read status back (by polling or webhooks). You keep your own website/app — this is a
server-to-server API.

> **You will be given:** an **API key** (`pk_…`). If you want push notifications, you
> will also be given a **webhook signing secret** (`whsec_…`). Keep both on your
> backend — never expose them in browser/mobile client code.

- **Base URL:** `https://<your-delivery-domain>` *(provided by us)*
- **Format:** JSON (`Content-Type: application/json`); all responses are JSON.
- **Auth:** send your API key in the `X-Api-Key` header on every request.

---

## 1. Authentication

Every request must include your key:

```
X-Api-Key: pk_your_key_here
```

A missing or revoked key returns `401 Unauthorized`. You never send a username or
password; the key alone identifies your account.

---

## 2. Place orders

`POST /api/partner/orders`

Creates one shipment containing one or more packages. Each package becomes a tracked
order with its own tracking number. Orders enter our system for review and then flow
to our couriers automatically.

### Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `orders` | array | yes | One or more packages (see below). |
| `senderFirstName` | string | no | Defaults to your account profile if omitted. |
| `senderLastName` | string | no | Defaults to your account profile. |
| `senderBusinessName` | string | no | Defaults to your account profile. |
| `senderPhone` | string | no | Defaults to your account profile. |
| `senderIdNumber` | string | no | Optional. |
| `pickUpCity` | string | no | Where we collect the parcels. Defaults to your profile. |
| `pickUpDistrict` | string | no | Defaults to your profile. |
| `pickUpAddress` | string | no | Defaults to your profile. |
| `note` | string | no | Free-text note for the whole shipment. |

Each item in **`orders`**:

| Field | Type | Required | Notes |
|---|---|---|---|
| `recipientName` | string | yes | |
| `recipientPhone` | string | yes | |
| `recipientCity` | string | yes | City name (Georgian or English accepted). |
| `recipientDistrict` | string | yes | District within the city. For the capital it may be left empty. |
| `recipientAddress` | string | yes | |
| `description` | string | no | What's in the package. |
| `isFragile` | bool | no | Default `false`. |
| `productPaymentStatus` | string | no | `"Paid"` (prepaid) or `"NotPaid"` (cash-on-delivery). Default `"NotPaid"`. |
| `whoPaysForCompanyService` | string | no | `"Sender"` (invoiced to you) or `"Recipient"` (collected as cash). Default `"Sender"`. |
| `amountToCollectForPackage` | number | no | COD amount to collect from the recipient (for `NotPaid`). |
| `companyServicePrice` | number | no | Optional delivery-fee override; omit to use your negotiated rate. |
| `externalReference` | string | no | **Your** order number. Strongly recommended — used to de-duplicate retries and to look the order up later. |

### Example

```bash
curl -X POST https://<your-delivery-domain>/api/partner/orders \
  -H "X-Api-Key: pk_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "orders": [{
      "recipientName": "ანა სმიტი",
      "recipientPhone": "599123456",
      "recipientCity": "თბილისი",
      "recipientDistrict": "",
      "recipientAddress": "პეკინის გამზ. 42",
      "productPaymentStatus": "NotPaid",
      "whoPaysForCompanyService": "Recipient",
      "amountToCollectForPackage": 45,
      "externalReference": "YOUR-BUSINESS-1023"
    }]
  }'
```

### Response — `201 Created`

```json
{
  "groupOrderId": "f0a1…",
  "orders": [
    { "trackingNumber": "TN-00000042-A3F9", "externalReference": "YOUR-BUSINESS-1023", "recipientName": "ანა სმიტი" }
  ]
}
```

Store the `trackingNumber` against your `externalReference`.

### Errors
- `401` — bad/missing API key.
- `409` — one or more `externalReference` values were already submitted (duplicate). The body lists the duplicates.
- `422` — validation error (e.g. unknown city/district, missing required field). The body's `errors` object details each field.

---

## 3. Read orders back (polling)

### List your orders
`GET /api/partner/orders?status=&search=&page=1&pageSize=50`

- `status` *(optional)* — filter by a public status name (see table below).
- `search` *(optional)* — matches tracking number, your external reference, recipient name, or phone.
- `page`, `pageSize` *(optional)* — pagination (max `pageSize` 200).

```json
{
  "total": 128, "page": 1, "pageSize": 50,
  "items": [{
    "trackingNumber": "TN-00000042-A3F9",
    "externalReference": "YOUR-BUSINESS-1023",
    "status": "OutForDelivery", "statusCode": 6,
    "recipientName": "ანა სმიტი",
    "recipientCity": "Tbilisi", "recipientDistrict": "Vake",
    "recipientAddress": "Pekini Ave 42",
    "productPaymentStatus": "NotPaid",
    "whoPaysForCompanyService": "Recipient",
    "amountToCollectForPackage": 45.00,
    "companyServicePrice": 5.00,
    "createdAt": "2026-06-16T09:12:00Z",
    "deliveredAt": null
  }]
}
```

### Get one order
`GET /api/partner/orders/{reference}`

`{reference}` may be our **tracking number** *or* your **externalReference**. Returns
the same fields plus a `trackingEvents` timeline. `404` if not found (or not yours).

You can only ever see your own orders.

---

## 4. Status codes

Both list and detail responses include `status` (name) and `statusCode` (number).
These are stable — integrate against them.

| Code | Status | Meaning |
|---|---|---|
| 1 | `Created` | Received, awaiting review. |
| 2 | `Accepted` | Accepted for pickup. |
| 3 | `PickupInProgress` | Courier is collecting from the sender. |
| 4 | `AtWarehouse` | Parcel received at our warehouse. |
| 5 | `InTransit` | On the way to the recipient's city. |
| 6 | `OutForDelivery` | Courier is delivering to the recipient. |
| 7 | `Delivered` | Delivered to the recipient. |
| 8 | `Postponed` | A delivery attempt was postponed. |
| 9 | `Cancelled` | Order was cancelled. |
| 10 | `Returned` | Parcel returned. |

---

## 5. Webhooks (push notifications)

Instead of polling, you can receive a signed `POST` to a URL you register with us
whenever one of your orders changes status. Ask us to register your endpoint; we give
you a **signing secret** (`whsec_…`).

### What we send

```
POST https://your-domain/your/webhook/path
Content-Type: application/json
X-Webhook-Event: order.status_changed
X-Webhook-Delivery: 7c9e…              (unique id for this delivery attempt)
X-Webhook-Signature: sha256=<hex>

{
  "event": "order.status_changed",
  "occurredAt": "2026-06-16T09:48:00Z",
  "trackingNumber": "TN-00000042-A3F9",
  "externalReference": "YOUR-BUSINESS-1023",
  "status": "OutForDelivery",
  "statusCode": 6,
  "previousStatus": "AtWarehouse",
  "recipientName": "ანა სმიტი"
}
```

Respond with any `2xx` status as fast as possible. Any non-2xx (or a timeout) is
retried with backoff (≈ 1m, 5m, 15m, 1h, 3h) up to 6 attempts.

### Verify the signature

The `X-Webhook-Signature` header is `sha256=` + the hex HMAC-SHA256 of the **raw
request body** using your secret. Recompute it and compare:

**Node.js**
```js
const crypto = require('crypto');

function isValid(rawBody, header, secret) {
  const expected = 'sha256=' +
    crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
```

**PHP**
```php
$expected = 'sha256=' . hash_hmac('sha256', $rawBody, $secret);
$valid = hash_equals($expected, $_SERVER['HTTP_X_WEBHOOK_SIGNATURE']);
```

### Idempotency
Delivery is **at-least-once** — the same event may arrive more than once after a
retry. Treat `X-Webhook-Delivery` (or the `trackingNumber` + `status` pair) as an
idempotency key and ignore duplicates.

---

## 6. Payment combinations

Decide, with us, how each order is paid. The two fields that matter:

- `productPaymentStatus` — `Paid` (prepaid, no cash collected) vs `NotPaid` (cash-on-delivery; set `amountToCollectForPackage`).
- `whoPaysForCompanyService` — `Recipient` (we collect the delivery fee in cash at the door) vs `Sender` (we invoice you for the delivery fee monthly).

If unsure which combination fits your business, ask us — we'll confirm the right setup.

---

## 7. Quick reference

| Action | Method & path |
|---|---|
| Place orders | `POST /api/partner/orders` |1
| List orders | `GET /api/partner/orders` |
| Get one order | `GET /api/partner/orders/{reference}` |
| Receive updates | Webhook `POST` to your URL |

All requests require the `X-Api-Key` header. Questions or credentials: contact us.
