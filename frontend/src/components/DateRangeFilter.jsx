import React from 'react';
import { Filter, RefreshCw, Calendar } from 'lucide-react';
import { useDateRange } from '../hooks/useDateRange';

export const DateRangeFilter = () => {
  const { startDate, endDate, setDateRange, resetDateRange, isFiltered } = useDateRange();

  const handleApply = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    setDateRange(fd.get('startDate'), fd.get('endDate'));
  };

  return (
    <div className="glass-card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
      <form onSubmit={handleApply} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: 1, minWidth: '130px', marginBottom: 0 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
            <Calendar size={12} /> Start Date
          </label>
          <input
            type="date"
            name="startDate"
            defaultValue={startDate}
            required
            style={{ padding: '0.65rem 0.85rem' }}
          />
        </div>
        <div className="form-group" style={{ flex: 1, minWidth: '130px', marginBottom: 0 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
            <Calendar size={12} /> End Date
          </label>
          <input
            type="date"
            name="endDate"
            defaultValue={endDate}
            required
            style={{ padding: '0.65rem 0.85rem' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: '200px' }}>
          <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '0.65rem' }}>
            <Filter size={14} /> Filter
          </button>
          {isFiltered && (
            <button type="button" className="btn btn-ghost" onClick={resetDateRange} style={{ flex: 1, padding: '0.65rem' }}>
              <RefreshCw size={14} /> Clear
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
