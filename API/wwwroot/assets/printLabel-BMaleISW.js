var e={sender:`გამგზავნი`,tel:`ტელ.`,recipient:`მიმღები`,address:`მისამართი`,toPay:`გადასახდელი`,tracking:`თრექინგი`},t=e=>(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`);function n(n){return`
    <div class="label">
        <div class="store">${t(n.storeName)}</div>
        <div class="muted">${e.sender} ${e.tel} ${t(n.senderPhone)||`—`}</div>
        <div class="rule"></div>
        <div class="field"><span class="lbl">${e.recipient}:</span> <span class="strong">${t(n.recipientName)}</span></div>
        <div class="field"><span class="lbl">${e.tel}</span> ${t(n.recipientPhone)}</div>
        <div class="field"><span class="lbl">${e.address}:</span> ${t(n.recipientAddress)}</div>
        <div class="rule"></div>
        <div class="pay"><span class="lbl">${e.toPay}:</span> <span class="amount">${t(n.amountText)}</span></div>
        <div class="spacer"></div>
        <div class="track">${e.tracking}: ${t(n.trackingNumber)}</div>
    </div>`}function r(e){if(e.length===0)return;let t=window.open(``,`_blank`,`width=420,height=640`);if(!t){alert(`Please allow pop-ups to print labels.`);return}let r=`<!DOCTYPE html>
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
${e.map(n).join(``)}
</body>
</html>`;t.document.open(),t.document.write(r),t.document.close(),t.focus(),setTimeout(()=>{try{t.print()}catch{}},350)}export{r as t};