import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { City } from '../../api/cities';
import { CityScheduleBoard } from '../Schedule/CityScheduleBoard';
import { EditDeliveryScheduleModal } from './AdminCitiesPage';

interface Props {
  token: string;
}

// Thin admin-only wrapper: owns the per-city schedule editor so CityScheduleBoard itself
// (shared with the Customer portal's lazy-loaded chunk) never imports admin UI.
export default function AdminSchedulePage({ token }: Props) {
  const queryClient = useQueryClient();
  const [editingCity, setEditingCity] = useState<City | null>(null);

  return (
    <>
      <CityScheduleBoard onEditCity={setEditingCity} />
      {editingCity && (
        <EditDeliveryScheduleModal
          token={token}
          city={editingCity}
          onClose={() => setEditingCity(null)}
          onSaved={() => {
            setEditingCity(null);
            queryClient.invalidateQueries({ queryKey: ['cities', 'allDistricts'] });
          }}
        />
      )}
    </>
  );
}
