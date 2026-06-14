import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../hooks/useToast';
import { useDateRange } from '../hooks/useDateRange';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { EmptyState } from '../components/EmptyState';
import { History as HistoryIcon, Filter, Trash2, Edit, Calendar, Search, ArrowUpDown, Copy } from 'lucide-react';

const CATEGORIES = [
  { name: 'Food', emoji: '🍔' },
  { name: 'Transport', emoji: '🚗' },
  { name: 'Shopping', emoji: '🛍️' },
  { name: 'Bills', emoji: '⚡' },
  { name: 'Entertainment', emoji: '🎬' },
  { name: 'Health', emoji: '💊' },
  { name: 'Education', emoji: '📚' },
  { name: 'Groceries', emoji: '🛒' },
  { name: 'Fitness', emoji: '🏋️' },
  { name: 'Travel', emoji: '✈️' },
  { name: 'Rent', emoji: '🏠' },
  { name: 'Subscriptions', emoji: '📱' },
  { name: 'Dining Out', emoji: '🍽️' },
  { name: 'Beauty', emoji: '💄' },
  { name: 'Pets', emoji: '🐾' },
  { name: 'Gifts', emoji: '🎁' },
  { name: 'Investment', emoji: '📊' },
  { name: 'Games', emoji: '🎮' },
  { name: 'Others', emoji: '📦' }
];

export default function History() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [months, setMonths] = useState([]);
  const [totalFiltered, setTotalFiltered] = useState(null);
  
  // Phase 4: Expense Management Toolkit
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortOption, setSortOption] = useState('date_desc');
  
  const { startDate, endDate, isFiltered } = useDateRange();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const fetchHistory = async () => {
    setLoading(true);
    try {
      let url = '/expenses/history';
      if (startDate && endDate) {
        url += `?start_date=${startDate}&end_date=${endDate}`;
      }
      const response = await api.get(url);
      if (isFiltered) {
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
    const init = async () => {
      await fetchHistory();
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, isFiltered]);

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

  const handleDuplicateExpense = async (exp) => {
    try {
      const payload = {
        amount: exp.amount,
        category: exp.category,
        note: exp.note + ' (Copy)',
        expense_date: new Date().toISOString().split('T')[0]
      };
      await api.post('/expenses', payload);
      showToast('Transaction duplicated successfully.', 'success');
      fetchHistory();
    } catch (err) {
      showToast('Failed to duplicate transaction.', 'error');
    }
  };

  const getEmoji = (catName) => {
    return CATEGORIES.find(c => c.name === catName)?.emoji || '📦';
  };

  const processedRecords = useMemo(() => {
    let result = records;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(r => (r.note || '').toLowerCase().includes(query) || r.category.toLowerCase().includes(query));
    }
    if (categoryFilter) {
      result = result.filter(r => r.category === categoryFilter);
    }
    
    return result.sort((a, b) => {
      if (sortOption === 'date_desc') return new Date(b.date) - new Date(a.date);
      if (sortOption === 'date_asc') return new Date(a.date) - new Date(b.date);
      if (sortOption === 'amount_desc') return b.amount - a.amount;
      if (sortOption === 'amount_asc') return a.amount - b.amount;
      return 0;
    });
  }, [records, searchQuery, categoryFilter, sortOption]);

  return (
    <div className="fade-in" style={{ maxWidth: '900px', margin: '2rem auto 0 auto' }}>
      {/* Title Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justify: 'center', color: 'var(--primary)' }}>
          <HistoryIcon size={18} />
        </div>
        <h2 style={{ fontSize: '1.25rem', color: '#fff', margin: 0 }}>Transaction Ledger</h2>
      </div>

      <DateRangeFilter />

      {loading && records.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="skeleton" style={{ width: '100%', height: '70px', borderRadius: '18px' }}></div>
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <div className="skeleton" style={{ width: '200px', height: '20px', marginBottom: '1rem' }}></div>
            <div className="activity-list">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="activity-item skeleton" style={{ height: '60px', padding: 0, border: 'none' }}></div>
              ))}
            </div>
          </div>
        </div>
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

          {/* Ledger Table/List & Management Toolkit */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '0.95rem', color: '#fff', margin: 0 }}>
                {isFiltered ? 'Filtered Transactions' : 'Recent Transactions'} ({processedRecords.length})
              </h3>
              
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
                <div style={{ position: 'relative', maxWidth: '200px', flex: 1 }}>
                  <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                  <input
                    type="text"
                    placeholder="Search note or category..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ width: '100%', padding: '0.45rem 0.75rem 0.45rem 2rem', fontSize: '0.8rem', borderRadius: '8px' }}
                  />
                </div>
                
                <select 
                  value={categoryFilter} 
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  style={{ width: 'auto', padding: '0.45rem 2rem 0.45rem 0.75rem', fontSize: '0.8rem', borderRadius: '8px', cursor: 'pointer' }}
                >
                  <option value="">All Categories</option>
                  {CATEGORIES.map(c => <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>)}
                </select>

                <select 
                  value={sortOption} 
                  onChange={(e) => setSortOption(e.target.value)}
                  style={{ width: 'auto', padding: '0.45rem 2rem 0.45rem 0.75rem', fontSize: '0.8rem', borderRadius: '8px', cursor: 'pointer' }}
                >
                  <option value="date_desc">Newest First</option>
                  <option value="date_asc">Oldest First</option>
                  <option value="amount_desc">Highest Amount</option>
                  <option value="amount_asc">Lowest Amount</option>
                </select>

                <button 
                  className="btn" 
                  onClick={() => {
                    const csvContent = "data:text/csv;charset=utf-8," 
                      + "Date,Category,Note,Amount\n" 
                      + processedRecords.map(e => `${e.date},${e.category},"${(e.note || '').replace(/"/g, '""')}",${e.amount}`).join("\n");
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", "expenses_export.csv");
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid var(--border-light)' }}
                >
                  Export CSV
                </button>
              </div>
            </div>
            
            <div className="activity-list">
              {processedRecords.length > 0 ? (
                processedRecords.map((exp) => (
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
                      <button className="act-btn" onClick={() => handleDuplicateExpense(exp)} title="Duplicate">
                        <Copy size={13} />
                      </button>
                      <button className="act-btn" onClick={() => navigate(`/edit/${exp.id}`)}>
                        <Edit size={12} />
                      </button>
                      <button className="act-btn danger" onClick={() => handleDeleteExpense(exp.id)} title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState 
                  icon={HistoryIcon} 
                  title="No transactions found" 
                  subtitle="Try adjusting your search or filters." 
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
