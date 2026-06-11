import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../hooks/useToast';
import { History as HistoryIcon, Filter, Trash2, Edit, Calendar, RefreshCw } from 'lucide-react';

const CATEGORIES = [
  { name: 'Food', emoji: '🍔' },
  { name: 'Transport', emoji: '🚗' },
  { name: 'Shopping', emoji: '🛍️' },
  { name: 'Bills', emoji: '⚡' },
  { name: 'Entertainment', emoji: '🎬' },
  { name: 'Health', emoji: '💊' },
  { name: 'Education', emoji: '📚' },
  { name: 'Groceries', emoji: '🛒' },
  { name: 'Others', emoji: '📦' }
];

export default function History() {
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [records, setRecords] = useState([]);
  const [months, setMonths] = useState([]);
  const [totalFiltered, setTotalFiltered] = useState(null);
  
  const [isFiltered, setIsFiltered] = useState(false);

  const { showToast } = useToast();
  const navigate = useNavigate();

  const fetchHistory = async () => {
    setLoading(true);
    try {
      let url = '/expenses/history';
      if (startDate && endDate) {
        url += `?start_date=${startDate}&end_date=${endDate}`;
        setIsFiltered(true);
      } else {
        setIsFiltered(false);
      }
      const response = await api.get(url);
      if (startDate && endDate) {
        setRecords(response.data.records || []);
        setTotalFiltered(response.data.total || 0);
        setMonths([]);
      } else {
        setRecords(response.data.records || []);
        setMonths(response.data.months || []);
        setTotalFiltered(null);
      }
    } catch (err) {
      showToast('Failed to load transaction history.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleApplyFilter = (e) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      showToast('Please select both start and end dates', 'warning');
      return;
    }
    fetchHistory();
  };

  const handleClearFilter = () => {
    setStartDate('');
    setEndDate('');
    // Wait for states to clear, then fetch
    setTimeout(() => {
      fetchHistory();
    }, 50);
  };

  const handleDeleteExpense = async (id) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    try {
      await api.delete(`/expenses/${id}`);
      showToast('Transaction deleted successfully.', 'info');
      fetchHistory();
    } catch (err) {
      showToast('Failed to delete transaction.', 'error');
    }
  };

  const getEmoji = (catName) => {
    return CATEGORIES.find(c => c.name === catName)?.emoji || '📦';
  };

  return (
    <div className="fade-in" style={{ maxWidth: '900px', margin: '2rem auto 0 auto' }}>
      {/* Title Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justify: 'center', color: 'var(--primary)' }}>
          <HistoryIcon size={18} />
        </div>
        <h2 style={{ fontSize: '1.25rem', color: '#fff', margin: 0 }}>Transaction Ledger</h2>
      </div>

      {/* Date Range Filter Box */}
      <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <form onSubmit={handleApplyFilter} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
            <label htmlFor="start-date-input">Start Date</label>
            <input
              type="date"
              id="start-date-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
            <label htmlFor="end-date-input">End Date</label>
            <input
              type="date"
              id="end-date-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', width: '100%', maxWidth: '280px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '0.85rem' }}>
              <Filter size={16} /> Filter
            </button>
            {isFiltered && (
              <button type="button" className="btn btn-ghost" onClick={handleClearFilter} style={{ flex: 1, padding: '0.85rem' }}>
                <RefreshCw size={16} /> Clear
              </button>
            )}
          </div>
        </form>
      </div>

      {loading ? (
        <div className="text-center" style={{ padding: '4rem 0' }}>Loading ledger entries...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Filter stats block */}
          {totalFiltered !== null && (
            <div className="stat-card" style={{ width: '100%' }}>
              <span className="stat-label">Total Spent In Selected Range</span>
              <span className="stat-value" style={{ color: 'var(--danger)' }}>
                ₹{Number(totalFiltered).toFixed(2)}
              </span>
            </div>
          )}

          {/* Monthly Totals Overview (only if not filtered) */}
          {!isFiltered && months.length > 0 && (
            <div className="glass-card" style={{ padding: '1.25rem' }}>
              <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.85rem', fontWeight: 700 }}>
                Monthly Summaries
              </h3>
              <div style={{ display: 'flex', gap: '0.65rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                {months.map((m, i) => (
                  <div key={i} style={{ padding: '0.65rem 1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', borderRadius: '10px', display: 'flex', flexDirection: 'column', minWidth: '120px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>{m.month}</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--danger)', marginTop: '0.15rem' }}>
                      −₹{Number(m.total).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ledger Table/List */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '0.9rem', color: '#fff', marginBottom: '1rem' }}>
              {isFiltered ? 'Filtered Transactions' : 'Recent Transactions'} ({records.length})
            </h3>
            
            <div className="activity-list">
              {records.length > 0 ? (
                records.map((exp) => (
                  <div key={exp.id} className="activity-item" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '0.85rem 0' }}>
                    <div className="activity-icon" style={{ background: 'rgba(255,255,255,0.02)' }}>{getEmoji(exp.category)}</div>
                    <div className="activity-info">
                      <div className="activity-cat">{exp.category}</div>
                      <div className="activity-note">{exp.note || 'No note'}</div>
                    </div>
                    <div className="activity-right" style={{ marginRight: '0.5rem' }}>
                      <div className="activity-amt" style={{ color: 'var(--danger)' }}>−₹{Number(exp.amount).toFixed(2)}</div>
                      <div className="activity-date" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Calendar size={10} /> {exp.date}
                      </div>
                    </div>
                    <div className="activity-actions">
                      <button className="act-btn" onClick={() => navigate(`/edit/${exp.id}`)}>
                        <Edit size={12} />
                      </button>
                      <button className="act-btn danger" onClick={() => handleDeleteExpense(exp.id)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', textAlign: 'center', padding: '3rem 0' }}>
                  No transactions found matching criteria.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
