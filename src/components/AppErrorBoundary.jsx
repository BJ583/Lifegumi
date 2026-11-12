import { Component } from "react";

export class AppErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Lifegumi render failed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main style={{ maxWidth: 520, margin: "12vh auto", padding: 24 }}>
        <h1>页面暂时无法显示</h1>
        <p>资料仍保存在本地。请重新加载；若问题持续，请保留错误信息以便排查。</p>
        <pre style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{this.state.error.message}</pre>
        <button type="button" onClick={() => window.location.reload()}>重新加载</button>
      </main>
    );
  }
}
