import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Calendar, LineChart, History, Settings, LogOut, User } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <>
      {/* Desktop Navigation */}
      <nav className="navbar">
        <div className="container nav-content">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span className="navbar-brand">💸 Spendly</span>
            <button 
              className="mobile-logout" 
              onClick={handleLogout}
              style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '1.25rem', marginRight: '0.5rem', cursor: 'pointer' }}
              title="Log Out"
            >
              <LogOut size={20} />
            </button>
          </div>
          <div className="navbar-links">
            <NavLink to="/dashboard" className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''}`}>
              DASHBOARD
            </NavLink>
            <NavLink to="/calendar" className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''}`}>
              CALENDAR
            </NavLink>
            <NavLink to="/analysis" className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''}`}>
              ANALYSIS
            </NavLink>
            <NavLink to="/history" className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''}`}>
              HISTORY
            </NavLink>
            <NavLink to="/setup" className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''}`}>
              SETTINGS
            </NavLink>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: '1rem', paddingLeft: '1rem', borderLeft: '1px solid var(--border-light)' }}>
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fff' }}>{user.name}</span>
                <button 
                  onClick={handleLogout} 
                  style={{ background: 'none', border: 'none', fontSize: '0.65rem', color: 'var(--danger)', fontWeight: 600, padding: 0, cursor: 'pointer', textAlign: 'right' }}
                >
                  LOGOUT
                </button>
              </div>
              {user.profile_pic ? (
                <img 
                  src={user.profile_pic} 
                  style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid var(--primary)', objectFit: 'cover' }} 
                  alt="Profile" 
                />
              ) : (
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--bg-card-elevated)', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justify: 'center', fontSize: '1.1rem' }}>
                  <User size={18} />
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Navigation Bar */}
      <div className="mobile-nav">
        <NavLink to="/dashboard" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
          <LayoutDashboard size={20} />
          <span>Home</span>
        </NavLink>
        <NavLink to="/calendar" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
          <Calendar size={20} />
          <span>Calendar</span>
        </NavLink>
        <NavLink to="/analysis" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
          <LineChart size={20} />
          <span>Stats</span>
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
          <History size={20} />
          <span>History</span>
        </NavLink>
        <NavLink to="/setup" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
          <Settings size={20} />
          <span>Setup</span>
        </NavLink>
      </div>
    </>
  );
};
