import { FormField } from '../../components/ui/FormField';
import { useLanguage } from '../../contexts/useLanguage';
import { ZONE_SALARY_KEYS as KEYS, type ZoneSalaryForm, type ZoneSalaryKey } from '../../utils/courierSalary';

interface Props {
  values: ZoneSalaryForm;
  errors: Partial<Record<ZoneSalaryKey, string>>;
  onChange: (key: ZoneSalaryKey, value: string) => void;
}

/** Capital / City / District salary inputs — see utils/courierSalary.ts for how they're applied. */
export function CourierZoneSalaryFields({ values, errors, onChange }: Props) {
  const { t } = useLanguage();
  const labels: Record<ZoneSalaryKey, string> = {
    capitalSalary:  t.courierCapitalSalary,
    citySalary:     t.courierCitySalary,
    districtSalary: t.courierDistrictSalary,
  };

  return (
    <div>
      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>
        {t.courierDefaultSalary}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
        {KEYS.map(k => (
          <FormField
            key={k}
            label={labels[k]}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={values[k]}
            onChange={e => onChange(k, e.target.value)}
            error={errors[k]}
            placeholder={t.phDefaultSalary}
          />
        ))}
      </div>
      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)', marginTop: 4, display: 'block' }}>
        {t.courierDefaultSalaryHint}
      </span>
    </div>
  );
}
