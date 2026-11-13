import { Component, type ErrorInfo, type ReactNode } from "react";

/** 最后一道渲染兜底：单条坏数据不应让整个页面变成白屏。 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 只记录错误类型和组件栈，不输出会话内容或密钥。
    console.error("页面渲染失败", error.name, info.componentStack?.slice(0, 500));
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="setup-guide" role="alert">
        <div className="welcome-emoji"><i className="ti ti-alert-triangle" aria-hidden="true"></i></div>
        <h2>页面遇到了问题</h2>
        <p className="setup-lead">
          这条学习记录可能包含无法显示的内容。回到首页后可以继续选择其他记录，或重新开始学习。
        </p>
        <button
          className="btn-send setup-go"
          onClick={() => {
            location.hash = "#/";
            location.reload();
          }}
        >
          回到首页
        </button>
      </div>
    );
  }
}
