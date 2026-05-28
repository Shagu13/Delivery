import { useState, useEffect, useCallback } from 'react';
import { updateCourier, CourierApiError } from '../api/couriers';
import type { Courier } from '../api/couriers';

export interface EditCourierForm {
    username: string;
    newPassword: string;
}

type FieldErrors = Partial<Record<keyof EditCourierForm, string>>;

export function useEditCourier(
    courier: Courier | null,
    token: string,
    onUpdated: (courierId: string, newUsername: string) => void,
) {
    const [form, setForm] = useState<EditCourierForm>({ username: '', newPassword: '' });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [globalError, setGlobalError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    // Pre-fill username whenever the selected courier changes
    useEffect(() => {
        if (courier) {
            setForm({ username: courier.username, newPassword: '' });
            setErrors({});
            setGlobalError(null);
            setSuccess(false);
        }
    }, [courier]);

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
                    username: form.username.trim(),
                    newPassword: form.newPassword || undefined,
                },
                token,
            );
            setSuccess(true);
            onUpdated(courier.courierId, form.username.trim());
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
