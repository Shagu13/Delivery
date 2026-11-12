import { useCallback } from 'react';
import type { AllDistrictEntry } from '../api/cities';
import type { Courier } from '../api/couriers';
import { useAllDistrictEntries } from './usePlaceLocalizer';

// A courier's salary is picked per recipient zone (capital / city / district) from the district's
// isCapitalTerritory / isCityTerritory flags. Mirrors Application.Couriers.CourierSalaryResolver —
// change both together. No fallback between zones: an empty zone price or an unknown district
// means no auto-fill, and the admin enters that order's salary by hand.

type SalaryCourier = Pick<Courier, 'capitalSalary' | 'citySalary' | 'districtSalary'>;

interface RecipientPlace { recipientCity: string; recipientDistrict: string }

/** Finds the district by (city, name) — names repeat across cities — like GroupOrderOrderBuilder.FindDistrict. */
function findDistrict(entries: AllDistrictEntry[], city: string, district: string): AllDistrictEntry | undefined {
    const name = district.trim().toLowerCase();
    const byName = entries.filter(e => e.districtName.toLowerCase() === name);
    const c = city.trim().toLowerCase();
    return byName.find(e => e.cityName.toLowerCase() === c) ?? byName[0];
}

export function zoneSalaryFor(
    entries: AllDistrictEntry[],
    courier: SalaryCourier | null | undefined,
    order: RecipientPlace,
): number | null {
    if (!courier) return null;
    const zone = findDistrict(entries, order.recipientCity ?? '', order.recipientDistrict ?? '');
    if (!zone) return null;
    const salary = zone.isCapitalTerritory ? courier.capitalSalary
                 : zone.isCityTerritory    ? courier.citySalary
                 :                           courier.districtSalary;
    return salary ?? null;
}

// ── Courier create/edit form helpers ──────────────────────────────────────────

/** Form-state shape shared by the create and edit courier modals (strings while editing). */
export interface ZoneSalaryForm {
    capitalSalary: string;
    citySalary: string;
    districtSalary: string;
}

export type ZoneSalaryKey = keyof ZoneSalaryForm;

export const ZONE_SALARY_KEYS: ZoneSalaryKey[] = ['capitalSalary', 'citySalary', 'districtSalary'];

/** Empty input → null (no auto-fill for that zone); otherwise the parsed amount. */
export const parseZoneSalary = (v: string): number | null => (v.trim() === '' ? null : parseFloat(v));

/** Returns an error message per zone whose input is not a valid non-negative number. */
export function validateZoneSalaries(form: ZoneSalaryForm, message: string): Partial<Record<ZoneSalaryKey, string>> {
    const errors: Partial<Record<ZoneSalaryKey, string>> = {};
    for (const k of ZONE_SALARY_KEYS) {
        if (form[k].trim() === '') continue;
        const v = parseFloat(form[k]);
        if (isNaN(v) || v < 0) errors[k] = message;
    }
    return errors;
}

/** Hook form: returns `(courier, order) => salary | null`, bound to the shared district list. */
export function useCourierZoneSalary() {
    const entries = useAllDistrictEntries();
    return useCallback(
        (courier: SalaryCourier | null | undefined, order: RecipientPlace) => zoneSalaryFor(entries, courier, order),
        [entries],
    );
}
