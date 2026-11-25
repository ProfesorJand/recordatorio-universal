import { useMemo } from 'react';
import { allTimezones, formatDateTime, tzLabel } from '../lib/time';

export default function TimezoneSelect({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const zones = useMemo(() => {
    const list = allTimezones();
    if (value && !list.includes(value)) list.unshift(value);
    return list.map((z) => ({ z, label: `${z.replace(/_/g, ' ')} (${tzLabel(z)})` }));
  }, [value]);

  return (
    <>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {zones.map(({ z, label }) => <option key={z} value={z}>{label}</option>)}
      </select>
      <div className="hint">Hora actual ahí: {formatDateTime(new Date().toISOString(), value)}</div>
    </>
  );
}
