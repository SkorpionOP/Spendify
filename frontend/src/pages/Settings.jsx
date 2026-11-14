import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Download, Upload } from 'lucide-react';
import { monthSummary, planFor, useStore } from '../lib/store';
import { currentMonth, today } from '../lib/dates';
import { money } from '../lib/format';
import { SplitSlider } from '../components/SplitSlider';
import { useToast } from '../components/Toasts';

export default function Settings() {
  const { state, updateProfile, updatePlan, addTopup, exportData, importData, resetAll } = useStore();
  const toast = useToast();
  const plan = planFor(state, currentMonth());
  const summary = monthSummary(state, currentMonth());

  const [name, setName] = useState(state.profile?.name || '');
  const [salary, setSalary] = useState(String(plan.salary || ''));
  const [needsPercent, setNeedsPercent] = useState(plan.needsPercent);
  const [topup, setTopup] = useState('');
  const [confirmReset, setConfirmReset] = useState('');

  const income = parseFloat(salary) || 0;
  const planChanged = income !== plan.salary || needsPercent !== plan.needsPercent;

  const savePlan = (e) => {
    e.preventDefault();
    if (income <= 0) return toast('Enter an income above zero.', { tone: 'warn' });
    updatePlan({ salary: income, needsPercent });
    toast('Budget updated for this month onward');
  };

  const doTopup = (kind) => {
    const v = parseFloat(topup);
    if (!v || v <= 0) return toast('Enter an amount to add.', { tone: 'warn' });
    addTopup(kind, v);
    setTopup('');
    toast(`Added ${money(v)} to ${kind === 'needs' ? 'this month’s budget' : 'savings'}`);
  };

  const download = () => {
    const blob = new Blob([exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `spendify-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup downloaded');
  };

  const restore = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (state.expenses.length && !window.confirm('Restoring replaces everything currently in the app. Continue?')) return;
    try {
      importData(await file.text());
      toast('Backup restored');
    } catch (err) {
      toast(err.message || 'That file could not be read.', { tone: 'warn' });
    }
  };

  return (
    <div className="page settings">
      <header className="page__head">
        <Link to="/" className="icon-btn settings__back" aria-label="Back to home">
          <ChevronLeft size={22} />
        </Link>
        <h1>Settings</h1>
      </header>

      <section className="card section">
        <h2>You</h2>
        <label className="field">
          <span className="field-label">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name.trim() !== state.profile?.name && (updateProfile({ name: name.trim() }), toast('Name saved'))}
          />
        </label>
      </section>

      <form className="card section" onSubmit={savePlan}>
        <h2>Monthly plan</h2>
        <p className="muted">Changes apply from this month. Earlier months keep the plan they had.</p>
        <label className="field">
          <span className="field-label">Monthly income</span>
          <div className="input-prefix">
            <span aria-hidden="true">₹</span>
            <input inputMode="decimal" value={salary} onChange={(e) => setSalary(e.target.value.replace(/[^\d.]/g, ''))} />
          </div>
        </label>
        <SplitSlider value={needsPercent} onChange={setNeedsPercent} income={income} />
        <button className="btn btn--primary btn--block" type="submit" disabled={!planChanged}>
          Save plan
        </button>
      </form>

      <section className="card section">
        <h2>Extra money this month</h2>
        <p className="muted">
          Got a bonus or a gift? Add it to this month’s budget ({money(summary.budget)}) or straight to savings (
          {money(summary.leftSavings)}).
        </p>
        <div className="input-prefix">
          <span aria-hidden="true">₹</span>
          <input
            inputMode="decimal"
            value={topup}
            onChange={(e) => setTopup(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="Amount"
            aria-label="Extra amount"
          />
        </div>
        <div className="btn-pair">
          <button className="btn btn--ghost" onClick={() => doTopup('needs')}>
            Add to budget
          </button>
          <button className="btn btn--ghost" onClick={() => doTopup('savings')}>
            Add to savings
          </button>
        </div>
      </section>

      <section className="card section">
        <h2>Backup</h2>
        <p className="muted">
          Your data lives only in this browser on this device. Download a backup now and then, and restore it if you
          switch phones or clear your browser.
        </p>
        <div className="btn-pair">
          <button className="btn btn--ghost" onClick={download}>
            <Download size={18} /> Download backup
          </button>
          <label className="btn btn--ghost">
            <Upload size={18} /> Restore backup
            <input type="file" accept="application/json,.json" onChange={restore} hidden />
          </label>
        </div>
      </section>

      <section className="card section danger-zone">
        <h2>Start over</h2>
        <p className="muted">Deletes every expense and your plan from this device. This can’t be undone.</p>
        <label className="field">
          <span className="field-label">Type “delete” to confirm</span>
          <input value={confirmReset} onChange={(e) => setConfirmReset(e.target.value)} autoComplete="off" />
        </label>
        <button
          className="btn btn--danger"
          disabled={confirmReset.trim().toLowerCase() !== 'delete'}
          onClick={() => resetAll()}
        >
          Delete all data
        </button>
      </section>

      <p className="settings__foot">Spendify works offline. Add it to your home screen from the browser menu.</p>
    </div>
  );
}
