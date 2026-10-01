import { useState } from 'react';
import { useLanguage } from '../../../contexts/useLanguage';
import {
    markOrderDelivered, markOrderDeliveredPaidToSender, postponeOrder, cancelDelivery,
} from '../../../api/orders';
import type { CourierOrder } from '../../../api/orders';
import { CameraScanner } from '../../../components/ui/CameraScanner';
import { CallPhoneButton } from '../../../components/ui/CallPhoneButton';
import { CollectConfirmModal } from './CollectConfirmModal';
import { PostponeModal } from './PostponeModal';
import { CancelModal } from './CancelModal';
import { collectTotal, needsCollect } from './courierCollect';
import './ScanDeliveryFlow.css';

interface Props {
    deliveries: CourierOrder[];
    token: string;
    busyId: string | null;
    onAct: (id: string, fn: () => Promise<void>, msg: string) => Promise<void>;
}

type Step = 'summary' | 'collect' | 'postpone' | 'cancel';

// Statuses in which the Deliveries list offers the deliver / postpone / cancel actions.
const ACTIONABLE = ['CourierAssignedToDeliver', 'CourierDeliveringTheOrderToRecipient'];

// "Scan at the door": the courier scans the parcel's label; if it is one of their deliveries a
// popup shows it and offers the same outcomes as the list — deliver (with the cash-collected
// confirmation when money is due), postpone, or cancel. Every action goes through the same
// API calls and `onAct` as the list, and the server still checks the parcel is theirs.
export function ScanDeliveryFlow({ deliveries, token, busyId, onAct }: Props) {
    const { t } = useLanguage();
    const [cameraOn, setCameraOn] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [order, setOrder] = useState<CourierOrder | null>(null);
    const [step, setStep] = useState<Step>('summary');

    const handleCode = (raw: string) => {
        const code = raw.trim().toUpperCase();
        setCameraOn(false);
        const match = deliveries.find(o => o.trackingNumber.toUpperCase() === code);
        if (!match) { setNotice(t.cdScanNotYours(code)); return; }
        if (!ACTIONABLE.includes(match.status)) { setNotice(t.cdScanNotDeliverable(code)); return; }
        setNotice(null);
        setStep('summary');
        setOrder(match);
    };

    const close = () => setOrder(null);
    const run = (o: CourierOrder, fn: () => Promise<void>, msg: string) => { close(); void onAct(o.id, fn, msg); };

    const mustCollect = order ? needsCollect(order) : false;
    const isBusy = order ? busyId === order.id : false;

    return (
        <div className="sdf">
            {cameraOn
                ? <CameraScanner onDetect={handleCode} onClose={() => setCameraOn(false)} />
                : (
                    <button type="button" className="sdf__scan-btn" onClick={() => { setNotice(null); setCameraOn(true); }}>
                        📷 {t.cdScanDeliveryBtn}
                    </button>
                )}
            {notice && <div className="sdf__notice" role="status">{notice}</div>}

            {order && (
                <div className="sdf-overlay">
                    {step === 'summary' && (
                        <div className="sdf-sheet" role="dialog" aria-modal="true">
                            <h3 className="sdf-sheet__track">{order.trackingNumber}</h3>
                            <dl className="sdf-sheet__rows">
                                {order.senderBusinessName && <><dt>{t.cdLabelSender}</dt><dd>{order.senderBusinessName}</dd></>}
                                <dt>{order.recipientName}</dt>
                                <dd>{[order.recipientAddress, order.recipientDistrict, order.recipientCity].filter(Boolean).join(', ')}</dd>
                                {order.recipientPhone && <><dt>{t.cdLabelPhone}</dt><dd><CallPhoneButton phone={order.recipientPhone} /></dd></>}
                            </dl>
                            {mustCollect && (
                                <div className="sdf-sheet__collect">
                                    <span>{t.cdLabelCollect}</span>
                                    <strong>₾{collectTotal(order).toFixed(2)}</strong>
                                </div>
                            )}
                            <button type="button" className="sdf-btn sdf-btn--ok" disabled={isBusy}
                                onClick={() => mustCollect
                                    ? setStep('collect')
                                    : run(order, () => markOrderDelivered(token, order.id), t.cdDeliveryToastDelivered)}>
                                {t.cdScanMarkDelivered}
                            </button>
                            <button type="button" className="sdf-btn sdf-btn--warn" disabled={isBusy} onClick={() => setStep('postpone')}>
                                {t.cdDeliveryBtnPostpone}
                            </button>
                            <button type="button" className="sdf-btn sdf-btn--danger" disabled={isBusy} onClick={() => setStep('cancel')}>
                                {t.cdDeliveryBtnCancel}
                            </button>
                            <button type="button" className="sdf-btn" onClick={close}>{t.close}</button>
                        </div>
                    )}
                    {step === 'collect' && (
                        <CollectConfirmModal order={order} isBusy={isBusy}
                            onCancel={() => setStep('summary')}
                            onConfirm={updatedAmount => run(order, () => markOrderDelivered(token, order.id, updatedAmount), t.cdDeliveryToastDelivered)}
                            onPaidToSender={feeAlsoToSender => run(order, () => markOrderDeliveredPaidToSender(token, order.id, feeAlsoToSender), t.cdDeliveryToastDelivered)} />
                    )}
                    {step === 'postpone' && (
                        <PostponeModal isBusy={isBusy}
                            onCancel={() => setStep('summary')}
                            onConfirm={(reason, comment) => run(order, () => postponeOrder(token, order.id, reason, comment), t.cdDeliveryToastPostponed)} />
                    )}
                    {step === 'cancel' && (
                        <CancelModal isBusy={isBusy}
                            onCancel={() => setStep('summary')}
                            onConfirm={(reason, comment) => run(order, () => cancelDelivery(token, order.id, reason, comment), t.cdDeliveryToastCancelled)} />
                    )}
                </div>
            )}
        </div>
    );
}
