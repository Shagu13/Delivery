// Parcel-label printing for customers. Builds a self-contained ~10×15cm sticker
// document in a new window and opens the browser print dialog (which also lets the
// user "Save as PDF" to download). Label text is Georgian by request, so senders /
// couriers reading the physical sticker get a consistent local-language label.

import { toString as qrToString } from 'qrcode';

export interface ParcelLabelData {
    storeName: string;
    recipientName: string;
    recipientPhone: string;
    recipientAddress: string;   // full line: address, district, city
    /** Pre-formatted amount due, e.g. "₾45.00", or the Georgian "paid" text. */
    amountText: string;
    trackingNumber: string;
}

// ── Brand assets (constant across every label) ──────────────────────────────────
// DILO social links — canonical form (tracking query params dropped so the QR codes
// are lower-density and easier to scan at the small printed size).
const INSTAGRAM_URL = 'https://instagram.com/dilodeliverygeo';
const FACEBOOK_URL  = 'https://www.facebook.com/share/1E7uXrB8Hp/';
const LOGO_URL      = '/dilo_logo.png';

interface BrandAssets {
    logo:  string;   // data: URL (empty string if it failed to load)
    igQr:  string;   // inline <svg> markup (empty string on failure)
    fbQr:  string;
}

// Generated once and reused — the logo and social QR codes never change.
let brandAssetsPromise: Promise<BrandAssets> | null = null;

async function fetchDataUrl(url: string): Promise<string> {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onloadend = () => resolve(fr.result as string);
        fr.onerror   = reject;
        fr.readAsDataURL(blob);
    });
}

function qrSvg(text: string): Promise<string> {
    // margin:2 keeps a small but scannable quiet zone; svg embeds inline (no image load).
    // The browser build of qrcode always renders SVG from toString().
    return qrToString(text, {
        type: 'svg', margin: 2, errorCorrectionLevel: 'M',
        color: { dark: '#111111', light: '#ffffff' },
    });
}

function loadBrandAssets(): Promise<BrandAssets> {
    if (!brandAssetsPromise) {
        brandAssetsPromise = (async () => {
            const [logo, igQr, fbQr] = await Promise.all([
                fetchDataUrl(LOGO_URL).catch(() => ''),
                qrSvg(INSTAGRAM_URL).catch(() => ''),
                qrSvg(FACEBOOK_URL).catch(() => ''),
            ]);
            return { logo, igQr, fbQr };
        })();
    }
    return brandAssetsPromise;
}

// Georgian field labels printed on the sticker.
const L = {
    recipient: 'მიმღები',
    tel:       'ტელ.',
    address:   'მისამართი',
    toPay:     'გადასახდელი',
    tracking:  'თრექინგი',
};

const esc = (s: string) =>
    (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderBrand(b: BrandAssets): string {
    const qr = (svg: string, cap: string) =>
        svg ? `<div class="qr">${svg}<div class="qr__cap">${cap}</div></div>` : '';
    const qrRow = (b.igQr || b.fbQr)
        ? `<div class="qr-row">${qr(b.igQr, 'Instagram')}${qr(b.fbQr, 'Facebook')}</div>`
        : '';
    const logo = b.logo ? `<img class="brand__logo" src="${b.logo}" alt="DILO" />` : '';
    if (!logo && !qrRow) return '';
    return `<div class="brand">${logo}${qrRow}</div>`;
}

function renderLabel(d: ParcelLabelData, brand: BrandAssets): string {
    return `
    <div class="label">
        <div class="store">${esc(d.storeName)}</div>
        <div class="rule"></div>
        <div class="field"><span class="lbl">${L.recipient}:</span> <span class="strong">${esc(d.recipientName)}</span></div>
        <div class="field"><span class="lbl">${L.tel}</span> ${esc(d.recipientPhone)}</div>
        <div class="field"><span class="lbl">${L.address}:</span> ${esc(d.recipientAddress)}</div>
        <div class="rule"></div>
        <div class="pay"><span class="lbl">${L.toPay}:</span> <span class="amount">${esc(d.amountText)}</span></div>
        <div class="spacer"></div>
        ${renderBrand(brand)}
        <div class="track">${L.tracking}: ${esc(d.trackingNumber)}</div>
    </div>`;
}

function buildHtml(labels: ParcelLabelData[], brand: BrandAssets): string {
    return `<!DOCTYPE html>
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
    .rule { border-top: 1.5px dashed #999; margin: 4mm 0; }
    .field { font-size: 13pt; line-height: 1.4; margin-bottom: 1.5mm; word-break: break-word; }
    .lbl { color: #555; font-size: 10pt; }
    .strong { font-weight: 700; }
    .pay { font-size: 14pt; margin-top: 1mm; }
    .amount { font-weight: 800; font-size: 20pt; }
    .spacer { flex: 1; }
    /* Branding block: company logo + social QR codes, sits just above the tracking line. */
    .brand { display: flex; align-items: center; justify-content: space-between; gap: 4mm; margin-bottom: 3mm; }
    .brand__logo { height: 14mm; width: auto; max-width: 42mm; object-fit: contain; }
    .qr-row { display: flex; gap: 4mm; }
    .qr { text-align: center; }
    .qr svg { width: 16mm; height: 16mm; display: block; }
    .qr__cap { font-size: 7pt; color: #555; margin-top: 0.5mm; letter-spacing: 0.3px; }
    .track { font-size: 11pt; letter-spacing: 0.5px; border-top: 1px solid #ddd; padding-top: 3mm; }
</style>
</head>
<body>
${labels.map(l => renderLabel(l, brand)).join('')}
</body>
</html>`;
}

export async function printParcelLabels(labels: ParcelLabelData[]): Promise<void> {
    if (labels.length === 0) return;

    // Open the window synchronously (still inside the click handler) so pop-up
    // blockers don't reject it; brand assets are fetched afterwards.
    const win = window.open('', '_blank', 'width=420,height=640');
    if (!win) {
        alert('Please allow pop-ups to print labels.');
        return;
    }
    win.document.write('<!doctype html><meta charset="utf-8"><title>Parcel labels</title><body style="font:14px sans-serif;padding:16px;color:#555">Preparing labels…</body>');

    const brand = await loadBrandAssets();

    win.document.open();
    win.document.write(buildHtml(labels, brand));
    win.document.close();
    win.focus();

    // Wait for embedded images (the logo) to finish loading before printing, so the
    // label never prints with a missing logo. Falls back after a short timeout.
    const imgs = Array.from(win.document.images);
    const waits = imgs.map(img =>
        img.complete
            ? Promise.resolve()
            : new Promise<void>(res => {
                img.addEventListener('load', () => res());
                img.addEventListener('error', () => res());
            }));

    await Promise.race([
        Promise.all(waits),
        new Promise<void>(res => setTimeout(res, 1500)),
    ]);

    setTimeout(() => { try { win.print(); } catch { /* user can print manually */ } }, 100);
}
