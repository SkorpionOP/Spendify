import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ArrowRight, Wallet, PieChart, Sparkles, ShieldCheck } from 'lucide-react';

export default function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  return (
    <div className="hero-section fade-in">
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
        <div style={{
          padding: '0.5rem 1rem',
          borderRadius: '99px',
          background: 'rgba(99, 102, 241, 0.1)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          color: 'var(--primary)',
          fontSize: '0.8rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <Sparkles size={14} /> Reimagining Personal Finance
        </div>
      </div>

      <h1 className="hero-title">
        Master Your Money <br />
        With High-Fidelity Bento Analytics
      </h1>
      
      <p className="hero-subtitle">
        A premium, hyper-visual envelope budget planner that optimizes your needs and protects your savings. Designed for clarity, performance, and aesthetic beauty.
      </p>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <Link to="/login" className="btn btn-primary" style={{ padding: '1rem 2rem' }}>
          Get Started <ArrowRight size={18} />
        </Link>
        <a href="#features" className="btn btn-ghost" style={{ padding: '1rem 2rem' }}>
          Explore Features
        </a>
      </div>

      {/* Feature Section Preview */}
      <div id="features" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginTop: '6rem', textAlign: 'left' }}>
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justify: 'center', color: 'var(--primary)' }}>
            <Wallet size={20} />
          </div>
          <h3 style={{ fontSize: '1.1rem', color: '#fff' }}>Envelope Budgeting</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Divide your salary into Needs and Savings compartments. Know exactly what you have left to spend.
          </p>
        </div>

        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justify: 'center', color: 'var(--accent)' }}>
            <ShieldCheck size={20} />
          </div>
          <h3 style={{ fontSize: '1.1rem', color: '#fff' }}>Savings Protection</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Log transactions worry-free. Our algorithm warns you when drawing from savings, preventing accidental deficit spending.
          </p>
        </div>

        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justify: 'center', color: 'var(--secondary)' }}>
            <PieChart size={20} />
          </div>
          <h3 style={{ fontSize: '1.1rem', color: '#fff' }}>Interactive Bento Analytics</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Stunning charts outlining category-wise distributions and daily trends, designed to load instantly.
          </p>
        </div>
      </div>
    </div>
  );
}
