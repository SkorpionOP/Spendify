import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { useToast } from '../hooks/useToast';
import { useDateRange } from '../hooks/useDateRange';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { EmptyState } from '../components/EmptyState';
import { PieChart, TrendingUp, Calendar, ChevronLeft, ChevronRight, DollarSign } from 'lucide-react';

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
  { name: 'Others', emoji: '📦' }
];

export default function Analysis() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const { startDate, endDate } = useDateRange();
  const { showToast } = useToast();

  const fetchAnalysisData = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/analysis?start_date=${startDate}&end_date=${endDate}`);
      setData(response.data);
    } catch (err) {
      showToast('Failed to load analysis metrics.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysisData();
  }, [startDate, endDate]);

  const getEmoji = (catName) => {
    return CATEGORIES.find(c => c.name === catName)?.emoji || '📦';
  };

  // SVG Area Line Chart Renderer with useMemo
  const trendChart = useMemo(() => {
    if (!data || !data.daily_dates || data.daily_dates.length === 0) {
      return <EmptyState icon={TrendingUp} title="No trend data" subtitle="Log expenses to see daily spending trends." />;
    }
    const dates = data.daily_dates;
    const totals = data.daily_totals;
    const maxVal = Math.max(...totals, 100);
    const height = 180;
    const width = 600;
    const paddingLeft = 40;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const points = dates.map((d, index) => {
      const x = paddingLeft + (index / (dates.length - 1 || 1)) * chartWidth;
      const y = paddingTop + chartHeight - (totals[index] / maxVal) * chartHeight;
      return { x, y };
    });

    const pathData = points.reduce((acc, p, index) => {
      return index === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, '');

    const areaData = points.length > 0
      ? `${pathData} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`
      : '';

    return (
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        
        {/* Y Axis Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((r, i) => (
          <line
            key={i}
            x1={paddingLeft}
            y1={paddingTop + r * chartHeight}
            x2={width - paddingRight}
            y2={paddingTop + r * chartHeight}
            stroke="rgba(255,255,255,0.04)"
            strokeDasharray="4 4"
          />
        ))}

        {/* Y-Axis values */}
        <text x={paddingLeft - 8} y={paddingTop + 4} fill="var(--text-tertiary)" fontSize="9" textAnchor="end">₹{maxVal.toFixed(0)}</text>
        <text x={paddingLeft - 8} y={paddingTop + chartHeight / 2 + 4} fill="var(--text-tertiary)" fontSize="9" textAnchor="end">₹{(maxVal / 2).toFixed(0)}</text>
        <text x={paddingLeft - 8} y={paddingTop + chartHeight + 4} fill="var(--text-tertiary)" fontSize="9" textAnchor="end">₹0</text>

        {/* Filled Area */}
        {areaData && <path d={areaData} fill="url(#areaGrad)" />}

        {/* Line Path */}
        {pathData && (
          <path
            d={pathData}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 4px 12px var(--primary-glow))' }}
          />
        )}

        {/* Points circles */}
        {points.map((p, idx) => (
          <circle
            key={idx}
            cx={p.x}
            cy={p.y}
            r="4"
            fill="#fff"
            stroke="var(--primary)"
            strokeWidth="2.5"
            style={{ cursor: 'pointer' }}
            title={`Day ${dates[idx]}: ₹${totals[idx].toFixed(2)}`}
          />
        ))}

        {/* X Axis Labels */}
        {dates.map((d, index) => {
          if (index % Math.max(1, Math.floor(dates.length / 8)) !== 0 && index !== dates.length - 1) return null;
          return (
            <text
              key={index}
              x={points[index].x}
              y={height - 10}
              fill="var(--text-tertiary)"
              fontSize="9"
              textAnchor="middle"
            >
              {d}
            </text>
          );
        })}
      </svg>
    );
  }, [data?.daily_dates, data?.daily_totals]);

  if (loading && !data) {
    return (
      <div className="fade-in" style={{ maxWidth: '1000px', margin: '2rem auto 0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
          <div className="skeleton" style={{ width: '36px', height: '36px', borderRadius: '10px' }}></div>
          <div>
            <div className="skeleton" style={{ width: '150px', height: '24px', marginBottom: '4px' }}></div>
            <div className="skeleton" style={{ width: '200px', height: '14px' }}></div>
          </div>
        </div>
        <div className="skeleton" style={{ width: '100%', height: '70px', marginBottom: '1.5rem', borderRadius: '18px' }}></div>
        <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card skeleton" style={{ height: '100px' }}></div>
          <div className="stat-card skeleton" style={{ height: '100px' }}></div>
          <div className="stat-card skeleton" style={{ height: '100px' }}></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
          <div className="glass-card skeleton" style={{ height: '250px' }}></div>
          <div className="glass-card skeleton" style={{ height: '250px' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ maxWidth: '1000px', margin: '2rem auto 0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justify: 'center', color: 'var(--primary)' }}>
          <PieChart size={18} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.25rem', color: '#fff', margin: 0 }}>Budget Analysis</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', margin: 0 }}>Visual insights for your spending</p>
        </div>
      </div>

      <DateRangeFilter />

      {loading ? (
        <div className="text-center" style={{ padding: '4rem 0' }}>Updating metrics...</div>
      ) : data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Top Info Bento Row */}
          <div className="stat-grid" style={{ marginBottom: 0 }}>
            <div className="stat-card">
              <span className="stat-label">Total Period Spent</span>
              <span className="stat-value" style={{ color: 'var(--danger)' }}>
                ₹{Number(data.total_spent).toFixed(0)}
              </span>
            </div>

            <div className="stat-card">
              <span className="stat-label">Daily Avg. Spending</span>
              <span className="stat-value">
                ₹{Number(data.daily_avg).toFixed(0)}
              </span>
            </div>

            <div className="stat-card">
              <span className="stat-label">Previous Period Delta</span>
              <div className="stat-value" style={{ color: data.spend_delta_pct > 0 ? 'var(--danger)' : 'var(--success)' }}>
                {data.spend_delta_pct > 0 ? '+' : ''}{Number(data.spend_delta_pct).toFixed(1)}%
              </div>
              <div className={`stat-delta ${data.spend_delta_pct > 0 ? 'delta-down' : 'delta-up'}`}>
                vs previous period
              </div>
            </div>

            <div className="stat-card">
              <span className="stat-label">Highest Expense</span>
              <div className="stat-value" style={{ color: 'var(--warning)' }}>
                {data.highest_tx ? `₹${Number(data.highest_tx.amount).toFixed(0)}` : 'N/A'}
              </div>
              <div className="stat-delta">
                {data.highest_tx ? `${getEmoji(data.highest_tx.category)} ${data.highest_tx.category}` : 'No data'}
              </div>
            </div>

            <div className="stat-card">
              <span className="stat-label">Income vs Expense</span>
              <div className="stat-value">
                {data.salary ? `₹${Number(data.salary - data.total_spent).toFixed(0)}` : 'N/A'}
              </div>
              <div className={`stat-delta ${data.salary - data.total_spent >= 0 ? 'delta-up' : 'delta-down'}`}>
                {data.salary - data.total_spent >= 0 ? 'Surplus (assuming 1mo)' : 'Deficit'}
              </div>
            </div>

            <div className="stat-card">
              <span className="stat-label">Total Needs Limit</span>
              <span className="stat-value">
                ₹{Number(data.needs).toFixed(0)}
              </span>
              <div className="stat-delta">Monthly cap</div>
            </div>
          </div>

          {/* Core Analytics Panels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
            {/* Daily Trend Line Card */}
            <div className="glass-card">
              <h3 style={{ fontSize: '0.95rem', color: '#fff', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <TrendingUp size={16} /> Daily Spending Trend
              </h3>
              <div className="chart-container" style={{ height: 'auto' }}>
                {trendChart}
              </div>
            </div>

            {/* Category Distribution progress list */}
            <div className="glass-card">
              <h3 style={{ fontSize: '0.95rem', color: '#fff', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <PieChart size={16} /> Categories Spent
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '5px' }}>
                {data.categories && data.categories.length > 0 ? (
                  data.categories.map((c, idx) => {
                    const percentage = data.total_spent > 0 ? (c.total / data.total_spent) * 100 : 0;
                    return (
                      <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                            <span>{getEmoji(c.category)}</span>
                            <span>{c.category}</span>
                          </span>
                          <span style={{ fontWeight: 700, color: '#fff' }}>
                            ₹{Number(c.total).toFixed(0)} ({percentage.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="progress-track" style={{ height: '6px' }}>
                          <div
                            className="progress-fill"
                            style={{
                              width: `${percentage}%`,
                              background: 'linear-gradient(90deg, var(--secondary), var(--primary))',
                              boxShadow: 'none'
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState 
                    icon={PieChart} 
                    title="No category data" 
                    subtitle="Log expenses to see category breakdowns." 
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
