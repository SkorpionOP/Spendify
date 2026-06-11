import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../hooks/useToast';
import { Edit3, ArrowLeft } from 'lucide-react';

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

export default function EditExpense() {
  const { id } = useParams();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food');
  const [note, setNote] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchExpense = async () => {
      try {
        const response = await api.get(`/expenses/${id}`);
        setAmount(response.data.amount);
        setCategory(response.data.category);
        setNote(response.data.note || '');
      } catch (err) {
        showToast('Failed to fetch transaction details.', 'error');
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };
    fetchExpense();
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      showToast('Please enter a valid amount', 'warning');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.put(`/expenses/${id}`, {
        amount: parseFloat(amount),
        category,
        note
      });
      showToast('Transaction updated successfully!', 'success');
      navigate('/dashboard');
    } catch (err) {
      showToast('Failed to update transaction.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="text-center" style={{ marginTop: '4rem' }}>Loading transaction details...</div>;

  return (
    <div style={{ maxWidth: '600px', margin: '2rem auto 0 auto' }} className="fade-in">
      <button 
        onClick={() => navigate(-1)} 
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '1.25rem', fontSize: '0.82rem', fontWeight: 600 }}
      >
        <ArrowLeft size={16} /> Go Back
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justify: 'center', color: 'var(--primary)' }}>
          <Edit3 size={18} />
        </div>
        <h2 style={{ fontSize: '1.25rem', color: '#fff', margin: 0 }}>Edit Transaction</h2>
      </div>

      <div className="glass-card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="edit-amount">Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              id="edit-amount"
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
            <label htmlFor="edit-note">Note</label>
            <input
              type="text"
              id="edit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What was this for?"
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
              SAVE CHANGES
            </button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => navigate(-1)}>
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
