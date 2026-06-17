import { Component, type ErrorInfo, type ReactNode } from 'react';
import { SvgIcon } from './SvgIcon';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="error-icon">
            <SvgIcon name="alert-triangle" size={56} />
          </div>
          <h2>页面加载异常</h2>
          <p>{this.state.error.message || '发生了未知错误。请刷新页面重试。'}</p>
          <button className="btn btn-glass" onClick={() => this.setState({ error: null })}>
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
