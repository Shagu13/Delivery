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
    /** Optional free-text order description entered by the customer; omitted from the
     *  sticker when empty. */
    description?: string;
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
    comment:   'აღწერა',
    toPay:     'გადასახდელი',
    tracking:  'თრექინგი',
};

const esc = (s: string) =>
    (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderBrand(b: BrandAssets): string {
    const qr = (svg: string, cap: string) =>
        svg ? `<div class="qr">${svg}<div class="qr__cap">${cap}</div></div>` : '';
    const logo = b.logo ? `<img class="brand__logo" src="${b.logo}" alt="DILO" />` : '';
    const ig = qr(b.igQr, 'Instagram');
    const fb = qr(b.fbQr, 'Facebook');
    if (!logo && !ig && !fb) return '';
    // Logo sits centered between the two social QR codes.
    return `<div class="brand">${ig}${logo}${fb}</div>`;
}

function renderLabel(d: ParcelLabelData, brand: BrandAssets): string {
    return `
    <div class="label">
        <div class="store">${esc(d.storeName)}</div>
        <div class="rule"></div>
        <div class="field"><span class="lbl">${L.recipient}:</span> <span class="strong">${esc(d.recipientName)}</span></div>
        <div class="field"><span class="lbl">${L.tel}</span> ${esc(d.recipientPhone)}</div>
        <div class="field"><span class="lbl">${L.address}:</span> ${esc(d.recipientAddress)}</div>
        ${d.description ? `<div class="field"><span class="lbl">${L.comment}:</span> ${esc(d.description)}</div>` : ''}
        <div class="rule"></div>
        <div class="pay"><span class="lbl">${L.toPay}:</span> <span class="amount">${esc(d.amountText)}</span></div>
        <div class="spacer"></div>
        ${renderBrand(brand)}
        <div class="track">${L.tracking}: ${esc(d.trackingNumber)}</div>
    </div>`;
}

// Selectable paper/label sizes. `a6` is the default. The roll sizes are continuous
// thermal paper (common phone-connected mini printers) — their print height is measured
// from the rendered content at print time, since CSS @page can't mix a length with `auto`.
interface SizeDef {
    id: string;
    label: string;   // shown in the on-screen size picker (Georgian)
    fixed: boolean;   // true → fixed @page height; false → continuous roll (height measured)
}
const LABEL_SIZES: readonly SizeDef[] = [
    { id: 'a6',     label: 'A6 — 100×150მმ',  fixed: true  },
    { id: 'sq100',  label: '100×100მმ',        fixed: true  },
    { id: 'roll80', label: '80მმ რულონი',      fixed: false },
    { id: 'roll58', label: '58მმ რულონი',      fixed: false },
];
const DEFAULT_SIZE = LABEL_SIZES[0].id;

// On-screen toolbar copy (never printed).
const T_SIZE  = 'ლეიბლის ზომა';
const T_PRINT = 'ბეჭდვა';

function buildHtml(labels: ParcelLabelData[], brand: BrandAssets): string {
    const options = LABEL_SIZES
        .map(s => `<option value="${s.id}"${s.id === DEFAULT_SIZE ? ' selected' : ''}>${esc(s.label)}</option>`)
        .join('');
    return `<!DOCTYPE html>
<html lang="ka">
<head>
<meta charset="utf-8" />
<title>Parcel labels</title>
<style id="page-style">@page { size: 100mm 150mm; margin: 0; }</style>
<style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: 'Sylfaen', 'Noto Sans Georgian', 'BPG Arial', 'DejaVu Sans', sans-serif; color: #111; }

    /* ── On-screen size picker (hidden when printing) ── */
    .toolbar {
        position: fixed; top: 0; left: 0; right: 0; z-index: 10;
        display: flex; align-items: center; gap: 10px; padding: 8px 12px;
        background: #1f2937; color: #fff; font: 14px sans-serif;
        box-shadow: 0 1px 6px rgba(0,0,0,0.25);
    }
    .toolbar select { font: 14px sans-serif; padding: 4px 8px; border-radius: 6px; border: 1px solid #cbd5e1; }
    .toolbar button { margin-left: auto; padding: 6px 20px; border: none; border-radius: 6px;
        background: #2563eb; color: #fff; font: 600 14px sans-serif; cursor: pointer; }
    @media screen {
        body { padding-top: 52px; background: #e5e7eb; }
        .label { margin: 0 auto 12px; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,0.15); }
    }
    @media print {
        .toolbar { display: none !important; }
        body { padding-top: 0 !important; background: #fff; }
        .label { margin: 0 !important; box-shadow: none !important; }
    }

    /* ── Shared structure (sizes only override dimensions/fonts below) ── */
    .label { page-break-after: always; display: flex; flex-direction: column; overflow: hidden; }
    .label:last-child { page-break-after: auto; }
    .store { font-weight: 800; line-height: 1.15; margin-bottom: 2mm; word-break: break-word; }
    .rule { border-top: 1.5px dashed #999; margin: 4mm 0; }
    .field { line-height: 1.4; margin-bottom: 1.5mm; word-break: break-word; }
    .lbl { color: #555; }
    .strong { font-weight: 700; }
    .pay { margin-top: 1mm; }
    .amount { font-weight: 800; }
    .spacer { flex: 1; }
    /* Branding block: company logo centered between the social QR codes. */
    .brand { display: flex; align-items: center; justify-content: space-between; gap: 4mm; margin-bottom: 3mm; }
    .brand__logo { width: auto; object-fit: contain; }
    .qr { text-align: center; }
    .qr svg { display: block; }
    .qr__cap { color: #555; margin-top: 0.5mm; letter-spacing: 0.3px; }
    .track { letter-spacing: 0.5px; border-top: 1px solid #ddd; padding-top: 3mm; }

    /* ── Size: A6 100×150mm (default) ── */
    .size-a6 .label { width: 100mm; height: 150mm; padding: 8mm; }
    .size-a6 .store { font-size: 19pt; }
    .size-a6 .field { font-size: 13pt; }
    .size-a6 .lbl { font-size: 10pt; }
    .size-a6 .pay { font-size: 14pt; }
    .size-a6 .amount { font-size: 20pt; }
    .size-a6 .qr svg { width: 16mm; height: 16mm; }
    .size-a6 .qr__cap { font-size: 7pt; }
    .size-a6 .track { font-size: 11pt; }
    .size-a6 .brand__logo { height: 14mm; max-width: 42mm; }

    /* ── Size: 100×100mm square ── */
    .size-sq100 .label { width: 100mm; height: 100mm; padding: 6mm; }
    .size-sq100 .store { font-size: 15pt; }
    .size-sq100 .field { font-size: 10.5pt; }
    .size-sq100 .lbl { font-size: 8pt; }
    .size-sq100 .pay { font-size: 11pt; }
    .size-sq100 .amount { font-size: 15pt; }
    .size-sq100 .qr svg { width: 12mm; height: 12mm; }
    .size-sq100 .qr__cap { font-size: 6pt; }
    .size-sq100 .track { font-size: 9pt; }
    .size-sq100 .brand__logo { height: 11mm; max-width: 34mm; }
    .size-sq100 .rule { margin: 2.5mm 0; }
    .size-sq100 .brand { margin-bottom: 2mm; }

    /* ── Size: 80mm continuous roll ── */
    .size-roll80 .label { width: 80mm; height: auto; padding: 5mm; }
    .size-roll80 .store { font-size: 15pt; }
    .size-roll80 .field { font-size: 11pt; }
    .size-roll80 .lbl { font-size: 8.5pt; }
    .size-roll80 .pay { font-size: 12pt; }
    .size-roll80 .amount { font-size: 16pt; }
    .size-roll80 .qr svg { width: 13mm; height: 13mm; }
    .size-roll80 .qr__cap { font-size: 6pt; }
    .size-roll80 .track { font-size: 9.5pt; }
    .size-roll80 .brand__logo { height: 12mm; max-width: 30mm; }
    .size-roll80 .rule { margin: 3mm 0; }

    /* ── Size: 58mm continuous roll (mini Bluetooth printers) ── */
    .size-roll58 .label { width: 58mm; height: auto; padding: 4mm; }
    .size-roll58 .store { font-size: 12pt; }
    .size-roll58 .field { font-size: 9pt; }
    .size-roll58 .lbl { font-size: 7pt; }
    .size-roll58 .pay { font-size: 9.5pt; }
    .size-roll58 .amount { font-size: 13pt; }
    .size-roll58 .qr svg { width: 11mm; height: 11mm; }
    .size-roll58 .qr__cap { font-size: 5.5pt; }
    .size-roll58 .track { font-size: 8pt; }
    .size-roll58 .brand__logo { height: 10mm; max-width: 22mm; }
    .size-roll58 .rule { margin: 2.5mm 0; }
    .size-roll58 .brand { gap: 2mm; }
</style>
</head>
<body class="size-${DEFAULT_SIZE}">
<div class="toolbar">
    <label>${T_SIZE}: <select id="size-select">${options}</select></label>
    <button id="print-btn" type="button">${T_PRINT}</button>
</div>
${labels.map(l => renderLabel(l, brand)).join('')}
<script>
(function () {
    // Fixed-height pages → static @page; continuous rolls → measure the tallest rendered
    // label and convert px→mm so the printer cuts at the right length.
    var FIXED = { a6: '100mm 150mm', sq100: '100mm 100mm' };
    var ROLL_W = { roll80: '80mm', roll58: '58mm' };
    function applySize(id) {
        document.body.className = 'size-' + id;
        var page;
        if (ROLL_W[id]) {
            var max = 0, labels = document.getElementsByClassName('label');
            for (var i = 0; i < labels.length; i++) {
                if (labels[i].offsetHeight > max) max = labels[i].offsetHeight;
            }
            var mm = Math.ceil(max * 25.4 / 96) + 2; // px → mm + small safety margin
            page = ROLL_W[id] + ' ' + mm + 'mm';
        } else {
            page = FIXED[id] || '100mm 150mm';
        }
        document.getElementById('page-style').textContent = '@page { size: ' + page + '; margin: 0; }';
    }
    var sel = document.getElementById('size-select');
    sel.addEventListener('change', function () { applySize(sel.value); });
    document.getElementById('print-btn').addEventListener('click', function () { window.print(); });
    applySize(sel.value);
})();
</script>
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

    // The window shows an on-screen size picker + Print button; the user chooses the
    // paper/label size and prints from there (so "Print" reflects their chosen size).
}
