import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Copy, ExternalLink, Home, RotateCw, X } from "lucide-react";

const HOME_URL = "https://bgm.tv/";

export function BangumiBrowser({ obscured, onClose }) {
  const hostRef = useRef(null);
  const [address, setAddress] = useState(HOME_URL);
  const [pageState, setPageState] = useState({ url: HOME_URL, title: "Bangumi", canGoBack: false, canGoForward: false, loading: true });

  useEffect(() => {
    const updateBounds = () => {
      const rect = hostRef.current?.getBoundingClientRect();
      if (!rect) return;
      window.lifegumi.setBangumiBrowserBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    };
    const observer = new ResizeObserver(updateBounds);
    if (hostRef.current) observer.observe(hostRef.current);
    const removeStateListener = window.lifegumi.onBangumiBrowserState((next) => {
      setPageState(next);
      if (next.url) setAddress(next.url);
    });
    window.addEventListener("resize", updateBounds);
    requestAnimationFrame(updateBounds);
    return () => {
      observer.disconnect();
      removeStateListener();
      window.removeEventListener("resize", updateBounds);
      window.lifegumi.hideBangumiBrowser();
    };
  }, []);

  useEffect(() => {
    if (obscured) {
      window.lifegumi.hideBangumiBrowser();
      return;
    }
    window.lifegumi.showBangumiBrowser().then(() => {
      const rect = hostRef.current?.getBoundingClientRect();
      if (rect) window.lifegumi.setBangumiBrowserBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    });
  }, [obscured]);
  function navigate(event) {
    event.preventDefault();
    window.lifegumi.navigateBangumiBrowser(address);
  }

  async function closeBrowser() {
    await window.lifegumi.closeBangumiBrowser();
    onClose();
  }

  return (
    <section className="bangumi-browser-page">
      <header className="bangumi-browser-toolbar">
        <div className="bangumi-browser-nav">
          <button title="后退" disabled={!pageState.canGoBack} onClick={() => window.lifegumi.controlBangumiBrowser("back")}><ArrowLeft size={17} /></button>
          <button title="前进" disabled={!pageState.canGoForward} onClick={() => window.lifegumi.controlBangumiBrowser("forward")}><ArrowRight size={17} /></button>
          <button title="刷新" onClick={() => window.lifegumi.controlBangumiBrowser("reload")}><RotateCw size={16} className={pageState.loading ? "is-spinning" : ""} /></button>
          <button title="Bangumi 首页" onClick={() => window.lifegumi.navigateBangumiBrowser(HOME_URL)}><Home size={16} /></button>
        </div>
        <form className="bangumi-address" onSubmit={navigate}>
          <input aria-label="Bangumi 地址" value={address} onChange={(event) => setAddress(event.target.value)} spellCheck="false" />
        </form>
        <div className="bangumi-browser-actions">
          <button title="复制当前网址" onClick={() => window.lifegumi.controlBangumiBrowser("copyUrl")}><Copy size={16} /></button>
          <button title="在默认浏览器打开" onClick={() => window.lifegumi.controlBangumiBrowser("external")}><ExternalLink size={16} /></button>
          <button title="关闭并释放内存" onClick={closeBrowser}><X size={18} /></button>
        </div>
      </header>
      <div className="bangumi-browser-host" ref={hostRef}>
        <span>正在打开 Bangumi...</span>
      </div>
    </section>
  );
}


