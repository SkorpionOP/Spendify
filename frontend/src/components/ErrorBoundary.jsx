import { Component } from 'react';
import { t } from '../lib/i18n';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Spendify ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) this.props.onReset();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback({ error: this.state.error, reset: this.handleReset });
      }
      return (
        <div className="card error-boundary-box" role="alert" style={{ padding: '24px', textAlign: 'center', margin: '16px auto', maxWidth: '420px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>{t('Something went wrong')}</h2>
          <p className="muted" style={{ fontSize: '0.875rem', marginBottom: '16px' }}>
            {this.state.error?.message || t('An unexpected error occurred.')}
          </p>
          <button type="button" className="btn btn--primary" onClick={this.handleReset}>
            {t('Try again')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
