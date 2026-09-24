# Delivery — Partner API Integration Guide

This guide explains how to integrate your website/system with our delivery platform.
Your backend pushes orders to us over HTTPS; our couriers pick up and deliver; you
read status back by polling. You keep your own website/app — this is a server-to-server
API, so it works with any backend language or framework.

> **You have been given:** an **API key** (`pk_…`). Keep it on your backend only —
> never expose it in browser/mobile client code, a public repo, or a frontend bundle.

- **Base URL:** `https://<your-delivery-domain>` *(provided separately)*
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

## 2. City & district lookup — avoid typos

`recipientCity` / `recipientDistrict` are free-text on the wire, but they are validated
against our real city/district list — an unrecognized name is rejected with `422`
("... is not a valid city" / "... is not a valid district in the selected city"),
**not** silently misfiled. Both Georgian and English names are accepted.

To avoid ever hitting that error, don't hardcode city/district names — populate your
own dropdown/autocomplete from these two **public, unauthenticated** endpoints (no
`X-Api-Key` needed; they're the same ones our own site's address form uses) and only
ever send values you loaded from them:

`GET /api/cities`
```json
[{ "id": "b3a1…", "cityName": "Tbilisi", "cityNameGeo": "თბილისი" }, ...]
```

`GET /api/cities/{cityId}/districts`
```json
[{ "id": "9f2c…", "districtName": "Vake", "districtNameGeo": "ვაკე" }, ...]
```

Send the `cityName`/`districtName` (or the Geo variant) as `recipientCity`/`recipientDistrict`
in your order request. For the capital, `recipientDistrict` may be left empty — we bind a
default district internally for pricing.

Refresh this list occasionally (e.g. once a day, or cache with a short TTL) rather than on
every order — cities/districts rarely change.

---

## 3. Place orders

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
| `externalReference` | string | no | **Your** order number. Strongly recommended — used to de-duplicate retries and to look the order up later. |

Your delivery fee is resolved automatically on our side (your negotiated rate, or the
destination's default rate) — you never need to send a price.

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

> **`groupOrderId` is a pickup batch, not a per-request id.** Orders you post during the
> same day from the same pickup address join the batch already waiting for collection, so
> repeated calls will return the **same** `groupOrderId` — this is expected, and means our
> courier makes one pickup run instead of one per call. Once the courier collects a batch,
> the next order you post starts a new one and you will see a new `groupOrderId`.
> Key your own records off `trackingNumber` / `externalReference`, never off `groupOrderId`.

### Errors
- `401` — bad/missing API key.
- `409` — one or more `externalReference` values were already submitted (duplicate). The body lists the duplicates.
- `422` — validation error (e.g. unknown city/district, missing required field). The body's `errors` object details each field.

---

## 4. Read orders back (polling)

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

We recommend polling on a schedule that fits your volume (e.g. every few minutes for
orders that aren't yet `Delivered`/`Cancelled`/`Returned`) rather than on every page load.

---

## 5. Status codes

Both list and detail responses include `status` (name) and `statusCode` (number).
These are stable — integrate against them; they won't change even if our internal
workflow does.

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

## 6. Payment combinations

Decide, with us, how each order is paid. The two fields that matter:

- `productPaymentStatus` — `Paid` (prepaid, no cash collected) vs `NotPaid` (cash-on-delivery; set `amountToCollectForPackage`).
- `whoPaysForCompanyService` — `Recipient` (we collect the delivery fee in cash at the door) vs `Sender` (we invoice you for the delivery fee monthly).

If unsure which combination fits your business, ask us — we'll confirm the right setup.

---

## 7. Quick reference

| Action | Method & path | Auth |
|---|---|---|
| List cities | `GET /api/cities` | none |
| List districts for a city | `GET /api/cities/{cityId}/districts` | none |
| Place orders | `POST /api/partner/orders` | `X-Api-Key` |
| List orders | `GET /api/partner/orders` | `X-Api-Key` |
| Get one order | `GET /api/partner/orders/{reference}` | `X-Api-Key` |

All requests require the `X-Api-Key` header. Questions or credentials: contact us.
