import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useToast } from '../hooks/useToast';
import { ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, DollarSign } from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function Calendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-indexed
  
  // Day View Modal State
  const [selectedDate, setSelectedDate] = useState(null);
  const [dayData, setDayData] = useState(null);
  const [loadingDay, setLoadingDay] = useState(false);

  const { showToast } = useToast();

  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear(prev => prev - 1);
    } else {
      setMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear(prev => prev + 1);
    } else {
      setMonth(prev => prev + 1);
    }
  };

  // Calendar Math
  const getDaysInMonth = (y, m) => new Date(y, m, 0).getDate();
  const getFirstDayOffset = (y, m) => {
    // 0 = Sunday, 1 = Monday ...
    return new Date(y, m - 1, 1).getDay();
  };

  const daysInMonth = getDaysInMonth(year, month);
  const offset = getFirstDayOffset(year, month);
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const offsetArray = Array.from({ length: offset }, (_, i) => null);

  const fetchDayDetails = async (day) => {
    const formattedMonth = String(month).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    const dateStr = `${year}-${formattedMonth}-${formattedDay}`;
    setSelectedDate(dateStr);
    setLoadingDay(true);
    try {
      const response = await api.get(`/expenses/day/${dateStr}`);
      setDayData(response.data);
    } catch (err) {
      showToast('Failed to fetch day details.', 'error');
    } finally {
      setLoadingDay(false);
    }
  };

  return (
    <div className="fade-in" style={{ maxWidth: '800px', margin: '2rem auto 0 auto' }}>
      {/* Calendar Header Control */}
      <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.2rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <CalendarIcon size={18} /> {MONTHS[month - 1]} {year}
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="act-btn" onClick={handlePrevMonth}>
              <ChevronLeft size={16} />
            </button>
            <button className="act-btn" onClick={handleNextMonth}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Grid Sheet */}
      <div className="glass-card" style={{ padding: '1rem' }}>
        {/* Days of Week Headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem', textAlign: 'center', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          <span>Sun</span>
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
        </div>

        {/* Days Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.45rem', minHeight: '320px' }}>
          {offsetArray.map((_, idx) => (
            <div key={`offset-${idx}`} style={{ background: 'transparent' }} />
          ))}
          {daysArray.map((day) => {
            const isToday = today.getDate() === day && today.getMonth() + 1 === month && today.getFullYear() === year;
            return (
              <button
                key={`day-${day}`}
                onClick={() => fetchDayDetails(day)}
                style={{
                  background: isToday ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255, 255, 255, 0.02)',
                  border: isToday ? '1px solid var(--primary)' : '1px solid var(--border-light)',
                  borderRadius: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '60px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: isToday ? 800 : 500,
                  fontSize: '0.9rem',
                  transition: 'all 0.2s'
                }}
                className="day-grid-cell"
              >
                <span>{day}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Day details sliding sheet/modal */}
      {selectedDate && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.25s ease-out'
        }}>
          <div className="glass-card" style={{ width: '90%', maxWidth: '480px', padding: '1.5rem', position: 'relative' }}>
            <button
              onClick={() => setSelectedDate(null)}
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>

            <h3 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CalendarIcon size={16} /> Details for {selectedDate}
            </h3>

            {loadingDay ? (
              <div className="text-center" style={{ padding: '2rem 0' }}>Loading transactions...</div>
            ) : dayData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ padding: '0.85rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700 }}>Total Spent</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--danger)', marginTop: '0.15rem' }}>
                    ₹{Number(dayData.total_spent).toFixed(2)}
                  </div>
                </div>

                <div>
                  <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: 700 }}>
                    Transactions
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                    {dayData.expenses && dayData.expenses.length > 0 ? (
                      dayData.expenses.map((exp) => (
                        <div key={exp.id} style={{ display: 'flex', justify: 'space-between', alignItems: 'center', padding: '0.6rem 0.85rem', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                          <div>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>{exp.category}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{exp.note || 'No note'}</div>
                          </div>
                          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fff' }}>
                            −₹{Number(exp.amount).toFixed(2)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textAlign: 'center', padding: '1rem' }}>
                        No transactions logged on this day.
                      </div>
                    )}
                  </div>
                </div>

                {dayData.categories && dayData.categories.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: 700 }}>
                      Category Breakdown
                    </h4>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {dayData.categories.map((c, i) => (
                        <span key={i} className="badge badge-primary">
                          {c.category}: ₹{Number(c.total).toFixed(0)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
