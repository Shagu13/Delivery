// Parcel-label printing for customers. Builds a self-contained ~10×15cm sticker
// document in a new window and opens the browser print dialog (which also lets the
// user "Save as PDF" to download). Label text is Georgian by request, so senders /
// couriers reading the physical sticker get a consistent local-language label.

import JsBarcode from 'jsbarcode';
import { queryClient } from '../queryClient';
import {
    fetchLabelDesign, saveLabelDesign, LABEL_DESIGN_QUERY_KEY, type LabelDesign,
} from '../api/labelDesign';import type { AuthUser } from '../types/auth';

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
    if (!b.logo) return '';
    // Two copies of the logo: the in-flow one is invisible and only reserves the header
    // space (so the text layout never shifts); `.logo-float` is the visible one, absolutely
    // positioned so the admin can drag it anywhere on the label (see the toolbar script).
    return `<div class="brand-top"><img class="brand__logo" src="${b.logo}" alt="" /></div>`
        + `<img class="logo-float" src="${b.logo}" alt="DILO" draggable="false" title="${T_DRAG_LOGO}" />`;
}

// Code 128 barcode of the tracking number, as an inline SVG string. JsBarcode emits a
// fixed pixel width; we drop it and keep only a viewBox, so CSS (width:100%, per-size
// height) stretches the bars to exactly the label's inner width — it can never overflow
// the border. Every module scales by the same factor, so it stays scannable.
function renderBarcode(value: string): string {
    if (!value) return '';
    try {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        // margin 20 = 10 modules (module width 2) of blank quiet zone each side, the Code 128
        // minimum. Hardware laser/CCD scanners need it; phone cameras don't, which is why a
        // margin-less barcode scanned fine on a phone but not on a scanner device.
        JsBarcode(svg, value, { format: 'CODE128', displayValue: false, margin: 20, width: 2, height: 60 });
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
    // User-typed width × height; `page` is a placeholder, the toolbar script sets the real one.
    { id: 'custom',  label: 'საკუთარი ზომა',  page: '100mm 150mm' },
];
const DEFAULT_SIZE = LABEL_SIZES[0].id;
const CUSTOM_MIN_MM = 30;
const CUSTOM_MAX_MM = 150;

// On-screen toolbar copy (never printed).
const T_SIZE  = 'ლეიბლის ზომა';
const T_PRINT = 'ბეჭდვა';
const T_WIDTH = 'სიგანე';
const T_HEIGHT = 'სიმაღლე';
const T_MM = 'მმ';
const T_RESET_LOGO = 'ლოგოს საწყისი პოზიცია';
const T_DRAG_LOGO = 'გადაიტანეთ ლოგო სასურველ ადგილას';

// Who is printing: the label window's settings (last size, custom width/height, logo position
// per size) are saved per user — in the database via /api/labeldesign so they follow the
// user across browsers, with localStorage as a fast local copy.
function readStoredSession(): Pick<AuthUser, 'token' | 'username'> | null {
    try {
        const raw = localStorage.getItem('delivery_auth');
        return raw ? JSON.parse(raw) as AuthUser : null;
    } catch {
        return null;   // storage unavailable or corrupt — fall back to local-only settings
    }
}

// The user's saved settings JSON from the server, or null if they have none / the request
// fails (the popup then falls back to its localStorage copy). Always fetched fresh at print
// time so a change made on another device is picked up.
async function loadSavedPrefs(token: string | undefined): Promise<string | null> {
    if (!token) return null;
    try {
        const saved = await queryClient.fetchQuery({
            queryKey: LABEL_DESIGN_QUERY_KEY,
            queryFn: () => fetchLabelDesign(token),
            staleTime: 0,
        });
        return saved?.prefsJson ?? null;
    } catch {
        return queryClient.getQueryData<LabelDesign | null>(LABEL_DESIGN_QUERY_KEY)?.prefsJson ?? null;
    }
}

interface WindowContext {
    storageKey: string;
    /** Settings JSON from the server; null = none saved (use the localStorage copy). */
    serverPrefsJson: string | null;
}

// JSON for embedding inside the popup's inline <script>; '<' is escaped so a value can
// never close the tag.
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

function buildHtml(labels: ParcelLabelData[], brand: BrandAssets, ctx: WindowContext): string {
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
    /* Sticky (not fixed) so it can wrap onto several rows in the narrow popup without
       covering the labels underneath. */
    .toolbar {
        position: sticky; top: 0; z-index: 10;
        display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 8px 12px;
        background: #1f2937; color: #fff; font: 14px sans-serif;
        box-shadow: 0 1px 6px rgba(0,0,0,0.25);
    }
    .toolbar select { font: 14px sans-serif; padding: 4px 8px; border-radius: 6px; border: 1px solid #cbd5e1; }
    .toolbar input[type=number] { width: 64px; font: 14px sans-serif; padding: 4px 6px; border-radius: 6px; border: 1px solid #cbd5e1; }
    .custom-dims { display: none; align-items: center; gap: 8px; }
    .toolbar button { padding: 6px 20px; border: none; border-radius: 6px;
        background: #2563eb; color: #fff; font: 600 14px sans-serif; cursor: pointer; }
    #print-btn { margin-left: auto; }
    #reset-logo { padding: 6px 12px; background: #4b5563; font-weight: 500; }
    @media screen {
        body { padding-bottom: 12px; background: #e5e7eb; }
        .label { margin: 12px auto 0; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,0.15); }
        .logo-float:hover { outline: 1px dashed #2563eb; }
    }
    @media print {
        .toolbar { display: none !important; }
        body { background: #fff; }
        .label { margin: 0 !important; box-shadow: none !important; }
    }

    /* ── Shared structure (sizes only override dimensions/fonts below) ── */
    .label { position: relative; page-break-after: always; display: flex; flex-direction: column; overflow: hidden; }
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
    .brand__logo { width: auto; object-fit: contain; visibility: hidden; }
    /* The visible, draggable logo. Width/height/left/top are set by the toolbar script. */
    .logo-float { position: absolute; z-index: 2; object-fit: contain; cursor: grab;
        touch-action: none; user-select: none; -webkit-user-select: none; }
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

    /* ── Size: custom — A6 proportions scaled by --k (square root of the area ratio vs A6),
       with --w / --h / --k set on <body> by the toolbar script. ── */
    .size-custom .label { width: var(--w); height: var(--h); padding: calc(7mm * var(--k)) calc(8mm * var(--k)); }
    .size-custom .store { font-size: calc(19pt * var(--k)); margin-bottom: calc(2mm * var(--k)); }
    .size-custom .field { font-size: calc(13pt * var(--k)); margin-bottom: calc(1.5mm * var(--k)); }
    .size-custom .lbl { font-size: calc(10pt * var(--k)); }
    .size-custom .pay { font-size: calc(14pt * var(--k)); }
    .size-custom .amount { font-size: calc(20pt * var(--k)); }
    .size-custom .track { font-size: calc(11pt * var(--k)); padding-top: calc(3mm * var(--k)); }
    .size-custom .brand__logo { height: calc(16mm * var(--k)); max-width: calc(45mm * var(--k)); }
    .size-custom .barcode { height: calc(16mm * var(--k)); margin-bottom: calc(1.5mm * var(--k)); }
    .size-custom .rule { margin: calc(3mm * var(--k)) 0; }
    .size-custom .brand-top { margin-bottom: calc(1.5mm * var(--k)); }
    /* Small custom labels get the same heavier weight as the 58×40 / 40×58 presets. */
    .size-custom.tiny .field, .size-custom.tiny .lbl, .size-custom.tiny .track { font-weight: 600; }
</style>
</head>
<body class="size-${DEFAULT_SIZE}">
<div class="toolbar">
    <label>${T_SIZE}: <select id="size-select">${options}</select></label>
    <span class="custom-dims" id="custom-dims">
        <label>${T_WIDTH} <input id="dim-w" type="number" min="${CUSTOM_MIN_MM}" max="${CUSTOM_MAX_MM}" step="1" /></label>
        <label>${T_HEIGHT} <input id="dim-h" type="number" min="${CUSTOM_MIN_MM}" max="${CUSTOM_MAX_MM}" step="1" /></label>
        <span>${T_MM}</span>
    </span>
    <button id="reset-logo" type="button">${T_RESET_LOGO}</button>
    <button id="print-btn" type="button">${T_PRINT}</button>
</div>
${labels.map(l => renderLabel(l, brand)).join('')}
<script>
(function () {
    var PAGE = ${JSON.stringify(Object.fromEntries(LABEL_SIZES.map(s => [s.id, s.page])))};
    var KEY = ${scriptJson(ctx.storageKey)};
    var MIN = ${CUSTOM_MIN_MM}, MAX = ${CUSTOM_MAX_MM};
    var DEFAULT_SIZE = ${scriptJson(DEFAULT_SIZE)};
    // The user's settings as saved in the database (a JSON string), or null if none.
    var SERVER_PREFS = ${scriptJson(ctx.serverPrefsJson)};

    // ── Remembered preferences: last size, custom width/height, logo position per size.
    //    Loaded from the server copy when there is one (it follows the user across devices),
    //    otherwise from this browser's localStorage; saved to both on every change. ──
    var prefs = { size: DEFAULT_SIZE, w: 100, h: 150, logo: {} };
    function clamp(v) {
        v = Math.round(Number(v));   // whole mm
        if (!isFinite(v)) v = MIN;
        return Math.min(MAX, Math.max(MIN, v));
    }
    function parseObject(text) {
        try {
            var r = JSON.parse(text);
            return r && typeof r === 'object' ? r : null;
        } catch (e) { return null; }
    }
    var raw = parseObject(SERVER_PREFS);
    if (!raw) {
        try { raw = parseObject(localStorage.getItem(KEY)); } catch (e) { /* storage unavailable */ }
    }
    if (raw) {
        // Never trust stored values — validate every field (the server only checks it is JSON).
        if (typeof raw.size === 'string' && PAGE[raw.size]) prefs.size = raw.size;
        if (typeof raw.w === 'number') prefs.w = clamp(raw.w);
        if (typeof raw.h === 'number') prefs.h = clamp(raw.h);
        if (raw.logo && typeof raw.logo === 'object') {
            Object.keys(raw.logo).forEach(function (id) {
                var p = raw.logo[id];
                if (PAGE[id] && p && typeof p.x === 'number' && typeof p.y === 'number'
                    && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) prefs.logo[id] = { x: p.x, y: p.y };
            });
        }
    }

    // Saves go to localStorage immediately and to the server a moment after the last change
    // (a drag fires many updates). The server call runs in the opener window, which holds the
    // auth token; it is a no-op when the opener is gone or the user is not signed in.
    var syncedJson = '';
    var pushTimer = null;
    function pushToServer() {
        pushTimer = null;
        var json = JSON.stringify(prefs);
        syncedJson = json;
        // On failure (offline / opener closed) forget the sync so the next change retries.
        var failed = function () { if (syncedJson === json) syncedJson = ''; };
        try {
            window.saveLabelPrefs(json).then(null, failed);
        } catch (e) { failed(); }
    }
    function save() {
        var json = JSON.stringify(prefs);
        try { localStorage.setItem(KEY, json); } catch (e) { /* ignore */ }
        if (json === syncedJson) return;
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(pushToServer, 600);
    }
    // Closing the window right after a change must not lose it.
    window.addEventListener('pagehide', function () {
        if (pushTimer) { clearTimeout(pushTimer); pushToServer(); }
    });

    var sel = document.getElementById('size-select');
    var dims = document.getElementById('custom-dims');
    var inW = document.getElementById('dim-w');
    var inH = document.getElementById('dim-h');
    var labelEls = Array.prototype.slice.call(document.querySelectorAll('.label'));

    // ── Draggable logo: the in-flow copy reserves space, the floating copy is placed at a
    //    fraction (x, y) of the label so the position scales across sizes. ──
    function placeLogos() {
        labelEls.forEach(function (label) {
            var ph = label.querySelector('.brand__logo');
            var fl = label.querySelector('.logo-float');
            if (!ph || !fl) return;
            var lr = label.getBoundingClientRect();
            var pr = ph.getBoundingClientRect();
            if (!lr.width || !lr.height) return;
            fl.style.width = pr.width + 'px';
            fl.style.height = pr.height + 'px';
            var p = prefs.logo[prefs.size] || {
                x: (pr.left - lr.left) / lr.width,
                y: (pr.top - lr.top) / lr.height
            };
            fl.style.left = (p.x * 100) + '%';
            fl.style.top = (p.y * 100) + '%';
        });
    }

    var drag = null;
    document.addEventListener('pointerdown', function (e) {
        var fl = e.target && e.target.closest ? e.target.closest('.logo-float') : null;
        if (!fl) return;
        var fr = fl.getBoundingClientRect();
        drag = { label: fl.parentNode, dx: e.clientX - fr.left, dy: e.clientY - fr.top, fw: fr.width, fh: fr.height };
        try { fl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        e.preventDefault();
    });
    document.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var lr = drag.label.getBoundingClientRect();
        var x = (e.clientX - drag.dx - lr.left) / lr.width;
        var y = (e.clientY - drag.dy - lr.top) / lr.height;
        x = Math.min(1 - drag.fw / lr.width, Math.max(0, x));
        y = Math.min(1 - drag.fh / lr.height, Math.max(0, y));
        prefs.logo[prefs.size] = { x: x, y: y };
        placeLogos();
    });
    function endDrag() {
        if (!drag) return;
        drag = null;
        save();
    }
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);

    document.getElementById('reset-logo').addEventListener('click', function () {
        delete prefs.logo[prefs.size];
        save();
        placeLogos();
    });

    // ── Size handling ──
    function applySize(id) {
        prefs.size = id;
        var b = document.body;
        var page = PAGE[id] || PAGE[DEFAULT_SIZE];
        b.className = 'size-' + id;
        dims.style.display = id === 'custom' ? 'flex' : 'none';
        if (id === 'custom') {
            var k = Math.sqrt(prefs.w * prefs.h / (100 * 150));
            b.style.setProperty('--w', prefs.w + 'mm');
            b.style.setProperty('--h', prefs.h + 'mm');
            b.style.setProperty('--k', String(k));
            if (k < 0.6) b.classList.add('tiny');
            page = prefs.w + 'mm ' + prefs.h + 'mm';
        }
        document.getElementById('page-style').textContent = '@page { size: ' + page + '; margin: 0; }';
        placeLogos();
        save();
    }
    function onDims(commit) {
        var w = Number(inW.value), h = Number(inH.value);
        if (commit) {
            prefs.w = clamp(w);
            prefs.h = clamp(h);
            inW.value = prefs.w;
            inH.value = prefs.h;
        } else if (w >= MIN && w <= MAX && h >= MIN && h <= MAX) {
            prefs.w = Math.round(w);
            prefs.h = Math.round(h);
        } else {
            return; // mid-typing, out of range — wait for the change event to clamp
        }
        applySize('custom');
    }

    sel.addEventListener('change', function () { applySize(sel.value); });
    inW.addEventListener('input', function () { onDims(false); });
    inH.addEventListener('input', function () { onDims(false); });
    inW.addEventListener('change', function () { onDims(true); });
    inH.addEventListener('change', function () { onDims(true); });
    document.getElementById('print-btn').addEventListener('click', function () { window.print(); });

    sel.value = prefs.size;
    inW.value = prefs.w;
    inH.value = prefs.h;
    applySize(prefs.size);
    // Loading alone must not write back to the server; only a real change should.
    syncedJson = JSON.stringify(prefs);
    // The logo's natural width is unknown until it has loaded — re-place once everything has.
    window.addEventListener('load', placeLogos);
})();
</script>
</body>
</html>`;
}

export async function printParcelLabels(labels: ParcelLabelData[]): Promise<void> {
    if (labels.length === 0) return;

    // Open the window synchronously (still inside the click handler) so pop-up
    // blockers don't reject it; brand assets are fetched afterwards.
    const win = window.open('', '_blank', 'width=560,height=700');
    if (!win) {
        alert('Please allow pop-ups to print labels.');
        return;
    }
    win.document.write('<!doctype html><meta charset="utf-8"><title>Parcel labels</title><body style="font:14px sans-serif;padding:16px;color:#555">Preparing labels…</body>');

    const session = readStoredSession();
    const [brand, serverPrefsJson] = await Promise.all([loadBrandAssets(), loadSavedPrefs(session?.token)]);

    win.document.open();
    win.document.write(buildHtml(labels, brand, {
        storageKey: `delivery_label_prefs_${session?.username ?? ''}`,
        serverPrefsJson,
    }));
    win.document.close();
    win.focus();

    // The popup saves through this window, which owns the auth token (it is never written
    // into the popup's HTML). Assigned after document.close(): the popup only calls it from
    // a debounced save, and document.open() above would otherwise be free to drop it.
    if (session?.token) {
        const token = session.token;
        Object.assign(win, {
            saveLabelPrefs: async (prefsJson: string): Promise<void> => {
                await saveLabelDesign({ prefsJson }, token);
                queryClient.setQueryData<LabelDesign | null>(LABEL_DESIGN_QUERY_KEY, { prefsJson });
            },
        });
    }

    // The window shows an on-screen size picker + Print button; the user chooses the
    // paper/label size and prints from there (so "Print" reflects their chosen size).
}
