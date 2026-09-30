// Parcel-label printing for customers. Builds a self-contained ~10×15cm sticker
// document in a new window and opens the browser print dialog (which also lets the
// user "Save as PDF" to download). Label text is Georgian by request, so senders /
// couriers reading the physical sticker get a consistent local-language label.

import JsBarcode from 'jsbarcode';

export interface ParcelLabelData {
    storeName: string;
    recipientName: string;
    recipientPhone: string;
    recipientAddress: string;   // full line: city, district, address
    /** Pre-formatted amount due, e.g. "₾45.00", or the Georgian "paid" text. */
    amountText: string;
    /** Optional free-text order description entered by the customer; omitted from the
     *  sticker when empty. */
    description?: string;
    trackingNumber: string;
}

// ── Brand assets (constant across every label) ──────────────────────────────────
const LOGO_URL = '/dilo_logo.png';

interface BrandAssets {
    logo: string;   // data: URL (empty string if it failed to load)
}

// Generated once and reused — the logo never changes.
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

function loadBrandAssets(): Promise<BrandAssets> {
    if (!brandAssetsPromise) {
        brandAssetsPromise = (async () => {
            const logo = await fetchDataUrl(LOGO_URL).catch(() => '');
            return { logo };
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

// Company logo, centered in a header row at the top of the label (fills what would
// otherwise be dead white space above the store name).
function renderLogo(b: BrandAssets): string {
    return b.logo ? `<div class="brand-top"><img class="brand__logo" src="${b.logo}" alt="DILO" /></div>` : '';
}

// Code 128 barcode of the tracking number, as an inline SVG string. JsBarcode emits a
// fixed pixel width; we drop it and keep only a viewBox, so CSS (width:100%, per-size
// height) stretches the bars to exactly the label's inner width — it can never overflow
// the border. Every module scales by the same factor, so it stays scannable.
function renderBarcode(value: string): string {
    if (!value) return '';
    try {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(svg, value, { format: 'CODE128', displayValue: false, margin: 0, width: 2, height: 60 });
        const w = parseFloat(svg.getAttribute('width') ?? '');
        const h = parseFloat(svg.getAttribute('height') ?? '');
        if (!w || !h) return '';
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.removeAttribute('style');
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svg.setAttribute('preserveAspectRatio', 'none');
        return `<div class="barcode">${svg.outerHTML}</div>`;
    } catch {
        return ''; // unencodable value — print the label without a barcode
    }
}

function renderLabel(d: ParcelLabelData, brand: BrandAssets): string {
    return `
    <div class="label">
        ${renderLogo(brand)}
        <div class="store">${esc(d.storeName)}</div>
        <div class="rule"></div>
        <div class="field"><span class="lbl">${L.recipient}:</span> <span class="strong">${esc(d.recipientName)}</span></div>
        <div class="field"><span class="lbl">${L.tel}</span> ${esc(d.recipientPhone)}</div>
        <div class="field"><span class="lbl">${L.address}:</span> ${esc(d.recipientAddress)}</div>
        ${d.description ? `<div class="field"><span class="lbl">${L.comment}:</span> ${esc(d.description)}</div>` : ''}
        <div class="rule"></div>
        <div class="pay"><span class="lbl">${L.toPay}:</span> <span class="amount">${esc(d.amountText)}</span></div>
        <div class="spacer"></div>
        ${renderBarcode(d.trackingNumber)}
        <div class="track">${L.tracking}: ${esc(d.trackingNumber)}</div>
        <div class="spacer spacer--end"></div>
    </div>`;
}

// Selectable paper/label sizes (all fixed dimensions). `a6` is the default. Each size
// has its own font/logo scale (CSS below) so the full label fits within its bounds.
interface SizeDef {
    id: string;
    label: string;   // shown in the on-screen size picker (Georgian)
    page: string;    // @page size, e.g. "100mm 150mm"
}
const LABEL_SIZES: readonly SizeDef[] = [
    { id: 'a6',      label: '100×150მმ (A6)', page: '100mm 150mm' },
    { id: 'l100x74', label: '100×74მმ',       page: '100mm 74mm'  },
    { id: 'l70x100', label: '70×100მმ',       page: '70mm 100mm'  },
    { id: 'l58x40',  label: '58×40მმ',        page: '58mm 40mm'   },
    { id: 'l40x58',  label: '40×58მმ',        page: '40mm 58mm'   },
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
    /* Pure black + exact color printing so low-dpi (thermal) printers don't dither
       gray/anti-aliased edges into a blur. See the size blocks for per-size weight. */
    body {
        font-family: 'Noto Sans Georgian', 'BPG Arial', 'Sylfaen', 'DejaVu Sans', sans-serif;
        color: #000;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
        -webkit-font-smoothing: none;
    }

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
    /* Suppress the trailing break on the final label. Use :last-of-type, not :last-child:
       the <script> tag is the last child of <body>, so the last label never matches
       :last-child — which left page-break-after:always on it and printed a blank page. */
    .label:last-of-type { page-break-after: auto; }
    .store { font-weight: 800; line-height: 1.15; margin-bottom: 2mm; word-break: break-word; overflow-wrap: anywhere; }
    .rule { border-top: 1.5px dashed #000; margin: 4mm 0; }
    /* Medium weight gives more ink coverage per glyph so strokes survive low-dpi
       printing instead of thinning out to a blur. */
    .field { line-height: 1.4; margin-bottom: 1.5mm; word-break: break-word; overflow-wrap: anywhere; font-weight: 500; }
    .lbl { color: #000; font-weight: 500; }
    .track { font-weight: 500; }
    .strong { font-weight: 700; }
    .pay { margin-top: 1mm; overflow-wrap: anywhere; }
    .amount { font-weight: 800; }
    /* Two flex spacers split the leftover vertical space around .track so it sits
       closer to .pay instead of being pinned to the very bottom edge. */
    .spacer { flex: 1; }
    .spacer--end { flex-grow: 2; }
    /* Company logo header — centered above the store name. */
    .brand-top { display: flex; align-items: center; justify-content: center; margin-bottom: 3mm; }
    .brand__logo { width: auto; object-fit: contain; }
    .barcode { width: 100%; flex: none; margin-bottom: 1.5mm; }
    .barcode svg { display: block; width: 100%; height: 100%; shape-rendering: crispEdges; }
    .track { letter-spacing: 0.5px; border-top: 1px solid #000; padding-top: 3mm; overflow-wrap: anywhere; }

    /* ── Size: A6 100×150mm (default) ── */
    .size-a6 .label { width: 100mm; height: 150mm; padding: 7mm 8mm; }
    .size-a6 .store { font-size: 19pt; }
    .size-a6 .field { font-size: 13pt; }
    .size-a6 .lbl { font-size: 10pt; }
    .size-a6 .pay { font-size: 14pt; }
    .size-a6 .amount { font-size: 20pt; }
    .size-a6 .track { font-size: 11pt; }
    .size-a6 .brand__logo { height: 16mm; max-width: 45mm; }
    .size-a6 .barcode { height: 16mm; }
    .size-a6 .rule { margin: 3mm 0; }
    .size-a6 .brand-top { margin-bottom: 1.5mm; }

    /* ── Size: 100×74mm (half-A6 landscape height) ── */
    .size-l100x74 .label { width: 100mm; height: 74mm; padding: 4mm 5mm; }
    .size-l100x74 .store { font-size: 13pt; margin-bottom: 1mm; }
    .size-l100x74 .field { font-size: 9.5pt; margin-bottom: 1mm; }
    .size-l100x74 .lbl { font-size: 7.5pt; }
    .size-l100x74 .pay { font-size: 10pt; }
    .size-l100x74 .amount { font-size: 13pt; }
    .size-l100x74 .track { font-size: 8.5pt; padding-top: 1.5mm; }
    .size-l100x74 .brand__logo { height: 5mm; max-width: 25mm; }
    .size-l100x74 .barcode { height: 9mm; margin-bottom: 1mm; }
    .size-l100x74 .rule { margin: 1.5mm 0; }
    .size-l100x74 .brand-top { margin-bottom: 0.5mm; }

    /* ── Size: 70×100mm ── */
    .size-l70x100 .label { width: 70mm; height: 100mm; padding: 4mm 5mm; }
    .size-l70x100 .store { font-size: 14pt; margin-bottom: 1.5mm; }
    .size-l70x100 .field { font-size: 10pt; }
    .size-l70x100 .lbl { font-size: 8pt; }
    .size-l70x100 .pay { font-size: 11pt; }
    .size-l70x100 .amount { font-size: 14pt; }
    .size-l70x100 .track { font-size: 9pt; padding-top: 1.5mm; }
    .size-l70x100 .brand__logo { height: 10mm; max-width: 20mm; }
    .size-l70x100 .barcode { height: 11mm; }
    .size-l70x100 .rule { margin: 1.8mm 0; }
    .size-l70x100 .brand-top { margin-bottom: 1mm; }

    /* ── Size: 58×40mm (small label sticker) — very compact ── */
    .size-l58x40 .label { width: 58mm; height: 40mm; padding: 2mm 2.5mm; }
    .size-l58x40 .store { font-size: 7.5pt; line-height: 1.05; margin-bottom: 0.5mm; }
    .size-l58x40 .field { font-size: 5.5pt; line-height: 1.15; margin-bottom: 0.3mm; }
    .size-l58x40 .lbl { font-size: 4.5pt; }
    .size-l58x40 .pay { font-size: 7pt; margin-top: 0.5mm; }
    .size-l58x40 .amount { font-size: 9pt; }
    .size-l58x40 .track { font-size: 5pt; padding-top: 0.8mm; }
    .size-l58x40 .brand__logo { height: 5mm; max-width: 20mm; }
    /* Tiny type dithers worst — go heavier so strokes stay solid on paper. */
    .size-l58x40 .field, .size-l58x40 .lbl, .size-l58x40 .track { font-weight: 600; }
    .size-l58x40 .barcode { height: 5mm; margin-bottom: 0.5mm; }
    .size-l58x40 .rule { margin: 0.6mm 0; }
    .size-l58x40 .brand-top { margin-bottom: 0.4mm; }

    /* ── Size: 40×58mm (small label sticker, portrait) — very compact ── */
    .size-l40x58 .label { width: 40mm; height: 58mm; padding: 2mm 2.5mm; }
    .size-l40x58 .store { font-size: 8pt; line-height: 1.1; margin-bottom: 0.8mm; }
    .size-l40x58 .field { font-size: 6pt; line-height: 1.2; margin-bottom: 0.5mm; }
    .size-l40x58 .lbl { font-size: 4.5pt; }
    .size-l40x58 .pay { font-size: 7.5pt; margin-top: 0.8mm; }
    .size-l40x58 .amount { font-size: 10pt; }
    .size-l40x58 .track { font-size: 5.5pt; padding-top: 1mm; }
    .size-l40x58 .brand__logo { height: 6mm; max-width: 25mm; }
    .size-l40x58 .field, .size-l40x58 .lbl, .size-l40x58 .track { font-weight: 600; }
    .size-l40x58 .barcode { height: 7mm; margin-bottom: 0.8mm; }
    .size-l40x58 .rule { margin: 0.9mm 0; }
    .size-l40x58 .brand-top { margin-bottom: 0.75mm; }
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
    var PAGE = ${JSON.stringify(Object.fromEntries(LABEL_SIZES.map(s => [s.id, s.page])))};
    function applySize(id) {
        document.body.className = 'size-' + id;
        document.getElementById('page-style').textContent =
            '@page { size: ' + (PAGE[id] || '100mm 150mm') + '; margin: 0; }';
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
