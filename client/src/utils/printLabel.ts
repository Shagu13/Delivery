// Parcel-label printing for customers. Builds a self-contained ~10×15cm sticker
// document in a new window and opens the browser print dialog (which also lets the
// user "Save as PDF" to download). Label text is Georgian by request, so senders /
// couriers reading the physical sticker get a consistent local-language label.

export interface ParcelLabelData {
    storeName: string;
    senderPhone: string;
    recipientName: string;
    recipientPhone: string;
    recipientAddress: string;   // full line: address, district, city
    /** Pre-formatted amount due, e.g. "₾45.00", or the Georgian "paid" text. */
    amountText: string;
    trackingNumber: string;
}

// Georgian field labels printed on the sticker.
const L = {
    sender:    'გამგზავნი',
    tel:       'ტელ.',
    recipient: 'მიმღები',
    address:   'მისამართი',
    toPay:     'გადასახდელი',
    tracking:  'თრექინგი',
};

const esc = (s: string) =>
    (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderLabel(d: ParcelLabelData): string {
    return `
    <div class="label">
        <div class="store">${esc(d.storeName)}</div>
        <div class="muted">${L.sender} ${L.tel} ${esc(d.senderPhone) || '—'}</div>
        <div class="rule"></div>
        <div class="field"><span class="lbl">${L.recipient}:</span> <span class="strong">${esc(d.recipientName)}</span></div>
        <div class="field"><span class="lbl">${L.tel}</span> ${esc(d.recipientPhone)}</div>
        <div class="field"><span class="lbl">${L.address}:</span> ${esc(d.recipientAddress)}</div>
        <div class="rule"></div>
        <div class="pay"><span class="lbl">${L.toPay}:</span> <span class="amount">${esc(d.amountText)}</span></div>
        <div class="spacer"></div>
        <div class="track">${L.tracking}: ${esc(d.trackingNumber)}</div>
    </div>`;
}

export function printParcelLabels(labels: ParcelLabelData[]): void {
    if (labels.length === 0) return;

    const win = window.open('', '_blank', 'width=420,height=640');
    if (!win) {
        // Popup blocked — let the caller surface this if they want.
        alert('Please allow pop-ups to print labels.');
        return;
    }

    const html = `<!DOCTYPE html>
<html lang="ka">
<head>
<meta charset="utf-8" />
<title>Parcel labels</title>
<style>
    @page { size: 100mm 150mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: 'Sylfaen', 'Noto Sans Georgian', 'BPG Arial', 'DejaVu Sans', sans-serif; color: #111; }
    .label {
        width: 100mm; height: 150mm; padding: 8mm; page-break-after: always;
        display: flex; flex-direction: column; overflow: hidden;
    }
    .label:last-child { page-break-after: auto; }
    .store { font-size: 19pt; font-weight: 800; line-height: 1.15; margin-bottom: 2mm; word-break: break-word; }
    .muted { font-size: 11pt; color: #444; }
    .rule { border-top: 1.5px dashed #999; margin: 4mm 0; }
    .field { font-size: 13pt; line-height: 1.4; margin-bottom: 1.5mm; word-break: break-word; }
    .lbl { color: #555; font-size: 10pt; }
    .strong { font-weight: 700; }
    .pay { font-size: 14pt; margin-top: 1mm; }
    .amount { font-weight: 800; font-size: 20pt; }
    .spacer { flex: 1; }
    .track { font-size: 11pt; letter-spacing: 0.5px; border-top: 1px solid #ddd; padding-top: 3mm; }
</style>
</head>
<body>
${labels.map(renderLabel).join('')}
</body>
</html>`;

    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    // Give the new document a moment to lay out (and load Georgian glyphs) before printing.
    setTimeout(() => { try { win.print(); } catch { /* user can print manually */ } }, 350);
}
