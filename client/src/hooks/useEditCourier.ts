import { useState, useCallback } from 'react';
import { updateCourier, CourierApiError } from '../api/couriers';
import type { Courier } from '../api/couriers';

export interface EditCourierForm {
    username:    string;
    newPassword: string;
    phoneNumber: string;
    idNumber:    string;
}

type FieldErrors = Partial<Record<keyof EditCourierForm, string>>;

function initialForm(courier: Courier | null): EditCourierForm {
    return {
        username:    courier?.username    ?? '',
        newPassword: '',
        phoneNumber: courier?.phoneNumber ?? '',
        idNumber:    courier?.idNumber    ?? '',
    };
}

export function useEditCourier(
    courier: Courier | null,
    token: string,
    onUpdated: (courierId: string, newUsername: string, newPhone: string, newIdNumber: string) => void,
) {
    // Key the entire form state off the courier's ID so React re-initializes
    // whenever a different courier is selected — no useEffect needed.
    const [form, setForm] = useState<EditCourierForm>(() => initialForm(courier));
    const [errors, setErrors] = useState<FieldErrors>({});
    const [globalError, setGlobalError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    // Called by the modal when it opens with a new courier (via key prop reset)
    // We also expose a reset function so the parent can force-reset if needed.
    const reset = useCallback((c: Courier | null) => {
        setForm(initialForm(c));
        setErrors({});
        setGlobalError(null);
        setSuccess(false);
    }, []);

    const handleChange = useCallback((field: keyof EditCourierForm, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }));
        setErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
        setGlobalError(null);
    }, []);

    const validate = (): FieldErrors => {
        const e: FieldErrors = {};
        if (!form.username.trim()) {
            e.username = 'Username is required.';
        } else if (!/^[a-zA-Z0-9_.-]+$/.test(form.username.trim())) {
            e.username = 'Only letters, digits, _ . - allowed.';
        }
        if (form.newPassword && form.newPassword.length < 8) {
            e.newPassword = 'Password must be at least 8 characters.';
        }
        if (!form.phoneNumber.trim()) {
            e.phoneNumber = 'Phone number is required.';
        } else if (!/^\d{9,15}$/.test(form.phoneNumber.trim())) {
            e.phoneNumber = 'Enter a valid phone number (digits only).';
        }
        if (!form.idNumber.trim()) {
            e.idNumber = 'ID number is required.';
        }
        return e;
    };

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!courier || !token) return;
        setGlobalError(null);
        setSuccess(false);

        const validationErrors = validate();
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            return;
        }

        setSubmitting(true);
        try {
            await updateCourier(
                courier.courierId,
                {
                    username:    form.username.trim(),
                    newPassword: form.newPassword || undefined,
                    phoneNumber: form.phoneNumber.trim(),
                    idNumber:    form.idNumber.trim(),
                },
                token,
            );
            setSuccess(true);
            onUpdated(courier.courierId, form.username.trim(), form.phoneNumber.trim(), form.idNumber.trim());
        } catch (err) {
            if (err instanceof CourierApiError && err.errors) {
                const mapped: FieldErrors = {};
                Object.entries(err.errors).forEach(([key, msgs]) => {
                    const k = (key.charAt(0).toLowerCase() + key.slice(1)) as keyof EditCourierForm;
                    mapped[k] = msgs[0];
                });
                setErrors(mapped);
            }
            setGlobalError(
                err instanceof CourierApiError
                    ? err.message
                    : 'An unexpected error occurred. Please try again.',
            );
        } finally {
            setSubmitting(false);
        }
    }, [courier, form, token, onUpdated]);

    return { form, errors, globalError, submitting, success, handleChange, handleSubmit };
}
