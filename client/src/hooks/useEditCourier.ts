import { useState, useCallback } from 'react';
import { updateCourier, CourierApiError } from '../api/couriers';
import type { Courier } from '../api/couriers';

export interface EditCourierForm {
    firstName:     string;
    lastName:      string;
    username:      string;
    newPassword:   string;
    phoneNumber:   string;
    idNumber:      string;
    defaultSalary: string;
}

type FieldErrors = Partial<Record<keyof EditCourierForm, string>>;

// Cities whose couriers get a standard per-order rate — see Courier.DefaultSalary doc comment.
// Mirrors Application.Couriers.CourierSalaryEligibility on the backend.
export const DEFAULT_SALARY_ELIGIBLE_CITIES = ['Tbilisi', 'Rustavi'];

export const isDefaultSalaryEligibleCity = (city: string) =>
    DEFAULT_SALARY_ELIGIBLE_CITIES.some(c => c.toLowerCase() === city.trim().toLowerCase());

export const isDefaultSalaryEligibleCourier = (courier: Courier | null) =>
    !!courier && isDefaultSalaryEligibleCity(courier.assignedCity);

function initialForm(courier: Courier | null): EditCourierForm {
    return {
        firstName:     courier?.firstName   ?? '',
        lastName:      courier?.lastName    ?? '',
        username:      courier?.username    ?? '',
        newPassword:   '',
        phoneNumber:   courier?.phoneNumber ?? '',
        idNumber:      courier?.idNumber    ?? '',
        defaultSalary: courier?.defaultSalary != null ? String(courier.defaultSalary) : '',
    };
}

export function useEditCourier(
    courier: Courier | null,
    token: string,
    onUpdated: (courierId: string, newFirstName: string, newLastName: string, newUsername: string, newPhone: string, newIdNumber: string, newDefaultSalary: number | null) => void,
) {
    // Key the entire form state off the courier's ID so React re-initializes
    // whenever a different courier is selected — no useEffect needed.
    const [form, setForm] = useState<EditCourierForm>(() => initialForm(courier));
    const [errors, setErrors] = useState<FieldErrors>({});
    const [globalError, setGlobalError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);



    const handleChange = useCallback((field: keyof EditCourierForm, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }));
        setErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
        setGlobalError(null);
    }, []);

    const validate = (): FieldErrors => {
        const e: FieldErrors = {};
        if (!form.firstName.trim()) {
            e.firstName = 'First name is required.';
        }
        if (!form.lastName.trim()) {
            e.lastName = 'Last name is required.';
        }
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
        if (isDefaultSalaryEligibleCourier(courier) && form.defaultSalary.trim() !== '') {
            const v = parseFloat(form.defaultSalary);
            if (isNaN(v) || v < 0) e.defaultSalary = 'Enter a valid non-negative amount.';
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
            const defaultSalary = isDefaultSalaryEligibleCourier(courier) && form.defaultSalary.trim() !== ''
                ? parseFloat(form.defaultSalary) : null;
            await updateCourier(
                courier.courierId,
                {
                    firstName:   form.firstName.trim(),
                    lastName:    form.lastName.trim(),
                    username:    form.username.trim(),
                    newPassword: form.newPassword || undefined,
                    phoneNumber: form.phoneNumber.trim(),
                    idNumber:    form.idNumber.trim(),
                    defaultSalary,
                },
                token,
            );
            setSuccess(true);
            onUpdated(courier.courierId, form.firstName.trim(), form.lastName.trim(), form.username.trim(), form.phoneNumber.trim(), form.idNumber.trim(), defaultSalary);
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
