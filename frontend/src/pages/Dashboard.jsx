import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useLayout } from '../components/Layout';
import { useToast } from '../hooks/useToast';
import { Plus, Trash2, Edit, Coins, HeartPulse, ShieldAlert, Sparkles, TrendingUp, Calendar as CalendarIcon, User } from 'lucide-react';

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

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food');
  const [note, setNote] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);

  // Topup State
  const [customTopup, setCustomTopup] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { enterFocusMode } = useLayout();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const fetchDashboardData = async () => {
    try {
      const response = await api.get('/dashboard');
      if (response.data.needs_setup) {
        navigate('/setup');
        return;
      }
      setData(response.data);
      if (response.data.alert) {
        showToast(response.data.alert, 'warning');
      }
    } catch (err) {
      showToast('Failed to load dashboard data.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const getEmoji = (catName) => {
    return CATEGORIES.find(c => c.name === catName)?.emoji || '📦';
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      showToast('Please enter a valid amount', 'warning');
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await api.post('/expenses', {
        amount: parseFloat(amount),
        category,
        note,
        expense_date: expenseDate
      });
      if (response.data.status === 'success') {
        showToast(response.data.message || 'Expense logged successfully!', 'success');
        if (response.data.alert) {
          showToast(response.data.alert, 'warning');
        }
        // Reset inputs
        setAmount('');
        setNote('');
        fetchDashboardData();
      }
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to add transaction.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTopup = async (e, type, customVal) => {
    e.preventDefault();
    const val = customVal || customTopup;
    if (!val || parseFloat(val) <= 0) {
      showToast('Please enter a valid amount', 'warning');
      return;
    }
    try {
      const endpoint = type === 'needs' ? '/budget/topup-needs' : '/budget/topup-savings';
      const payload = type === 'needs' ? { needs: parseFloat(val) } : { savings: parseFloat(val) };
      const response = await api.post(endpoint, payload);
      showToast(response.data.message, 'success');
      setCustomTopup('');
      fetchDashboardData();
    } catch (err) {
      showToast('Topup failed.', 'error');
    }
  };

  const handleDeleteExpense = async (id) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
      await api.delete(`/expenses/${id}`);
      showToast('Expense deleted successfully.', 'info');
      fetchDashboardData();
    } catch (err) {
      showToast('Failed to delete expense.', 'error');
    }
  };

  if (loading) return <div className="text-center" style={{ marginTop: '4rem' }}>Loading dashboard...</div>;
  if (!data) return null;

  return (
    <div className="fade-in">
      {/* Dashboard Header */}
      <div className="db-header hideable">
        <div>
          <div className="db-greeting">
            Good {data.now_hour >= 17 ? 'evening' : data.now_hour >= 12 ? 'afternoon' : 'morning'} 👋
          </div>
          <div className="db-date" id="db-live-date">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div className="db-header-right">
          {/* Health Score Mini Ring */}
          <div className="health-mini" title="Financial Health Score">
            <div className="health-ring-wrap">
              <svg className="health-ring-svg" viewBox="0 0 56 56">
                <circle className="health-ring-bg" cx="28" cy="28" r="22" />
                <circle
                  className="health-ring-fill"
                  cx="28"
                  cy="28"
                  r="22"
                  stroke="#10b981"
                  strokeDasharray="138.2"
                  strokeDashoffset={138.2 * (1 - 0.83)}
                />
              </svg>
              <div className="health-ring-label">83</div>
            </div>
            <div className="health-info">
              <div className="health-title">Health Score</div>
              <div className="health-score-text">Excellent</div>
            </div>
          </div>
          {/* Focus Mode button */}
          <button
            className="focus-toggle-btn"
            onClick={() => enterFocusMode(data.remaining_needs, data.usage_percent)}
            title="Focus Mode (shortcut: F)"
          >
            Focus Mode
          </button>
        </div>
      </div>

      {/* Bento Stats Grid */}
      <div className="bento-db hideable">
        <div className="bento-stat db-col-3">
          <div className="stat-label">Monthly Income</div>
          <div className="stat-value" style={{ color: 'var(--primary)' }}>
            ₹{Number(data.salary).toFixed(0)}
          </div>
          <div className="stat-delta delta-up">
            <TrendingUp size={11} /> Active
          </div>
        </div>

        <div className="bento-stat db-col-3">
          <div className="stat-label">Total Spent</div>
          <div className="stat-value">₹{Number(data.total_spent).toFixed(0)}</div>
          <div className={`stat-delta ${data.usage_percent >= 80 ? 'delta-warn' : 'delta-up'}`}>
            {Number(data.usage_percent).toFixed(0)}% of needs
          </div>
        </div>

        <div className="bento-stat db-col-3">
          <div className="stat-label">Budget Left</div>
          <div
            className="stat-value"
            style={{ color: data.remaining_needs < 0 ? 'var(--danger)' : 'var(--success)' }}
          >
            ₹{Number(Math.abs(data.remaining_needs)).toFixed(0)}
          </div>
          <div className={`stat-delta ${data.remaining_needs < 0 ? 'delta-down' : 'delta-up'}`}>
            {data.remaining_needs < 0 ? 'Over budget' : 'Remaining'}
          </div>
        </div>

        <div className="bento-stat db-col-3">
          <div className="stat-label">Savings Balance</div>
          <div className="stat-value">₹{Number(data.remaining_savings).toFixed(0)}</div>
          <div className="stat-delta delta-up">
            <Coins size={11} /> Growing
          </div>
        </div>

        {/* Budget Usage Card */}
        <div className="budget-card db-col-8 hideable">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.5rem' }}>
            <div>
              <div className="stat-label" style={{ fontSize: '.68rem', marginBottom: '.3rem' }}>Needs Budget Usage</div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                ₹{Number(data.total_spent).toFixed(0)} / ₹{Number(data.needs).toFixed(0)}
              </h3>
            </div>
            <div
              className="budget-pct-badge"
              style={{
                color: data.usage_percent >= 100 ? 'var(--danger)' : data.usage_percent >= 80 ? 'var(--warning)' : 'var(--success)',
                filter: 'drop-shadow(0 0 8px currentColor)'
              }}
            >
              {Number(data.usage_percent).toFixed(0)}%
            </div>
          </div>
          <div className="budget-progress-track">
            <div
              className="budget-progress-fill"
              style={{
                width: `${Math.min(data.usage_percent, 100)}%`,
                background: data.usage_percent >= 100 ? 'var(--danger)' : data.usage_percent >= 80 ? 'var(--warning)' : 'linear-gradient(90deg, var(--primary), var(--accent))'
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.7rem', color: 'rgba(255,255,255,.3)', fontWeight: 600 }}>
            <span>₹0</span>
            <span>Cap: ₹{Number(data.needs).toFixed(0)}</span>
          </div>
        </div>

        {/* Top Category Bento Card */}
        <div className="bento-stat db-col-4 hideable" style={{ justifyContent: 'flex-start', gap: '.75rem' }}>
          <div className="stat-label">Top Category</div>
          {data.top_category ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
              <div style={{ fontSize: '1.75rem', lineHeight: 1 }}>
                {getEmoji(data.top_category.category)}
              </div>
              <div>
                <div style={{ fontSize: '.82rem', fontWeight: 700, color: '#fff' }}>
                  {data.top_category.category}
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--danger)' }}>
                  ₹{Number(data.top_category.total).toFixed(0)}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '.82rem', color: 'rgba(255,255,255,.3)' }}>No data yet</div>
          )}
          <div className="stat-delta delta-down" style={{ fontSize: '.65rem' }}>
            Highest spend category
          </div>
        </div>
      </div>

      {/* Main Grid: Forms and Lists */}
      <div id="main-grid" style={{ marginBottom: '1.5rem' }}>
        {/* Log Transaction Form */}
        <div className="add-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '1.25rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: 'rgba(99,102,241,.15)', border: '1px solid rgba(99,102,241,.25)', display: 'flex', alignItems: 'center', justify: 'center' }}>
              <Plus size={16} color="#6366f1" />
            </div>
            <h3 style={{ fontSize: '.95rem', fontWeight: 800, color: '#fff', margin: 0 }}>Add Transaction</h3>
          </div>
          
          <form onSubmit={handleAddExpense}>
            <div className="form-group">
              <label htmlFor="amount-input">Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                id="amount-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            
            <div className="form-group">
              <label>Category</label>
              <div className="category-grid">
                {CATEGORIES.map((cat) => (
                  <div
                    key={cat.name}
                    className={`cat-chip ${category === cat.name ? 'selected' : ''}`}
                    onClick={() => setCategory(cat.name)}
                  >
                    <span>{cat.emoji}</span>
                    <span>{cat.name}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="note-input">Note</label>
              <input
                type="text"
                id="note-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What was this for?"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="expense-date">Date</label>
              <input
                type="date"
                id="expense-date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
            </div>
            
            <button type="submit" className="btn btn-primary btn-full" disabled={isSubmitting}>
              LOG EXPENSE
            </button>
          </form>

          {/* Quick Top-ups */}
          <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,.06)' }}>
            <div style={{ fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'rgba(255,255,255,.3)', marginBottom: '.85rem' }}>Quick Top-up</div>
            <div style={{ display: 'flex', gap: '.6rem', marginBottom: '.6rem', flexWrap: 'wrap' }}>
              <button className="btn btn-ghost btn-full" style={{ fontSize: '.72rem', padding: '.6rem .75rem', flex: 1 }} onClick={(e) => handleTopup(e, 'needs', 500)}>
                + ₹500 Budget
              </button>
              <button className="btn btn-ghost btn-full" style={{ fontSize: '.72rem', padding: '.6rem .75rem', flex: 1 }} onClick={(e) => handleTopup(e, 'savings', 1000)}>
                + ₹1k Savings
              </button>
            </div>
            
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="number"
                value={customTopup}
                onChange={(e) => setCustomTopup(e.target.value)}
                placeholder="Custom amount..."
                style={{ width: '100%', padding: '.7rem', paddingRight: '160px', fontSize: '.8rem' }}
              />
              <div style={{ position: 'absolute', right: '.3rem', display: 'flex', gap: '.3rem' }}>
                <button
                  className="btn btn-primary"
                  style={{ padding: '.4rem .65rem', fontSize: '.68rem', borderRadius: '6px' }}
                  onClick={(e) => handleTopup(e, 'needs')}
                >
                  Budget
                </button>
                <button
                  className="btn"
                  style={{ padding: '.4rem .65rem', fontSize: '.68rem', background: 'rgba(16,185,129,.15)', color: 'var(--accent)', border: '1px solid rgba(16,185,129,.3)', borderRadius: '6px' }}
                  onClick={(e) => handleTopup(e, 'savings')}
                >
                  Savings
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity List */}
        <div className="add-card" style={{ display: 'flex', flexDirection: 'column', maxHeight: '600px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.22)', display: 'flex', alignItems: 'center', justify: 'center' }}>
                <CalendarIcon size={16} color="#10b981" />
              </div>
              <h3 style={{ fontSize: '.95rem', fontWeight: 800, color: '#fff', margin: 0 }}>Recent Activity</h3>
            </div>
            <Link to="/history" style={{ fontSize: '.72rem', fontWeight: 700, color: 'rgba(255,255,255,.35)' }}>
              View All →
            </Link>
          </div>
          
          <div className="activity-list" style={{ overflowY: 'auto', flex: 1 }}>
            {data.expenses && data.expenses.length > 0 ? (
              data.expenses.map((exp) => (
                <div key={exp.id} className="activity-item">
                  <div className="activity-icon">{getEmoji(exp.category)}</div>
                  <div className="activity-info">
                    <div className="activity-cat">{exp.category}</div>
                    <div className="activity-note">{exp.note || 'No note'}</div>
                  </div>
                  <div className="activity-right" style={{ marginRight: '.5rem' }}>
                    <div className="activity-amt">−₹{Number(exp.amount).toFixed(2)}</div>
                    <div className="activity-date">{exp.date}</div>
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
              <div className="empty-state">
                <div className="empty-icon">
                  <Coins size={24} color="rgba(255,255,255,.3)" />
                </div>
                <div className="empty-title">No transactions yet</div>
                <div className="empty-sub">Log your first expense using the form to get started.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
