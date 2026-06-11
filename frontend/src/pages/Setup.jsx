import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../hooks/useToast';
import { Settings, CreditCard, Percent, ChevronRight } from 'lucide-react';

export default function Setup() {
  const [salary, setSalary] = useState('');
  const [needsPercent, setNeedsPercent] = useState(70);
  const [savingsPercent, setSavingsPercent] = useState(30);
  
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasConfig, setHasConfig] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { showToast } = useToast();
  const navigate = useNavigate();

  const checkExistingConfig = async () => {
    try {
      const response = await api.get('/dashboard');
      if (response.data && !response.data.needs_setup) {
        setHasConfig(true);
        setSalary(response.data.salary || '');
        setNeedsPercent(response.data.needs / response.data.salary * 100 || 70);
        setSavingsPercent(response.data.savings / response.data.salary * 100 || 30);
      }
    } catch (e) {
      // Ignore auth errors here, handled globally
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    checkExistingConfig();
  }, []);

  const handleSliderChange = (e) => {
    const val = parseInt(e.target.value);
    setNeedsPercent(val);
    setSavingsPercent(100 - val);
  };

  const handleInitialSetup = async (e) => {
    e.preventDefault();
    if (!salary || parseFloat(salary) <= 0) {
      showToast('Please enter a valid salary amount', 'warning');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post('/budget/setup', {
        salary: parseFloat(salary),
        needs_percent: needsPercent,
        savings_percent: savingsPercent
      });
      showToast('Budget initialized successfully!', 'success');
      navigate('/dashboard');
    } catch (err) {
      showToast(err.response?.data?.detail || 'Setup failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateSalary = async (e) => {
    e.preventDefault();
    if (!salary || parseFloat(salary) <= 0) {
      showToast('Please enter a valid salary amount', 'warning');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post('/budget/salary', { salary: parseFloat(salary) });
      showToast('Monthly salary updated successfully!', 'success');
    } catch (err) {
      showToast(err.response?.data?.detail || 'Update failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePercent = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/budget/percent', {
        needs_percent: needsPercent,
        savings_percent: savingsPercent
      });
      showToast('Budget allocations updated successfully!', 'success');
    } catch (err) {
      showToast(err.response?.data?.detail || 'Update failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isInitializing) {
    return <div className="text-center" style={{ marginTop: '4rem' }}>Loading settings...</div>;
  }

  return (
    <div style={{ maxWidth: '650px', margin: '2rem auto 0 auto' }} className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justify: 'center', color: 'var(--primary)' }}>
          <Settings size={18} />
        </div>
        <h2 style={{ fontSize: '1.25rem', color: '#fff' }}>
          {hasConfig ? 'Budget Configurations' : 'Initialize envelope budget'}
        </h2>
      </div>

      {!hasConfig ? (
        // Initial setup wizard
        <div className="glass-card">
          <form onSubmit={handleInitialSetup}>
            <div className="form-group">
              <label htmlFor="setup-salary">Monthly Net Salary (₹)</label>
              <input
                type="number"
                id="setup-salary"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="e.g. 50000"
                required
              />
            </div>

            <div className="form-group" style={{ margin: '2rem 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.85rem', fontWeight: 700 }}>
                <span style={{ color: 'var(--primary)' }}>Needs: {needsPercent}%</span>
                <span style={{ color: 'var(--accent)' }}>Savings: {savingsPercent}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={needsPercent}
                onChange={handleSliderChange}
                style={{ cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.5rem' }}>
                <span>Strict Budgeting (0/100)</span>
                <span>Balanced (50/50)</span>
                <span>High Spending (100/0)</span>
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={isSubmitting}>
              Start Tracking <ChevronRight size={18} />
            </button>
          </form>
        </div>
      ) : (
        // Split setting controls for updates
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Salary Update Card */}
          <div className="glass-card">
            <h3 style={{ fontSize: '0.95rem', color: '#fff', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CreditCard size={16} /> Update Monthly Salary
            </h3>
            <form onSubmit={handleUpdateSalary} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label htmlFor="update-salary">Salary (₹)</label>
                <input
                  type="number"
                  id="update-salary"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                  placeholder="e.g. 50000"
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ padding: '0.85rem 1.5rem' }} disabled={isSubmitting}>
                Save
              </button>
            </form>
          </div>

          {/* Allocation Splits Card */}
          <div className="glass-card">
            <h3 style={{ fontSize: '0.95rem', color: '#fff', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Percent size={16} /> Budget Allocation Splits
            </h3>
            <form onSubmit={handleUpdatePercent}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.85rem', fontWeight: 700 }}>
                <span style={{ color: 'var(--primary)' }}>Needs: {needsPercent}%</span>
                <span style={{ color: 'var(--accent)' }}>Savings: {savingsPercent}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={needsPercent}
                onChange={handleSliderChange}
                style={{ cursor: 'pointer', marginBottom: '1.5rem' }}
              />
              <button type="submit" className="btn btn-primary btn-full" disabled={isSubmitting}>
                Save Splits
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
