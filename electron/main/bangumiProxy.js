function normalizeBangumiProxy(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  let url;
  try {
    url = new URL(value.includes("://") ? value : `http://${value}`);
  } catch {
    throw new Error("请输入本机代理地址，例如 127.0.0.1:7897");
  }
  const port = Number(url.port);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    || !Number.isInteger(port) || port < 1 || port > 65535
    || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("仅支持本机 HTTP 代理地址，例如 127.0.0.1:7897");
  }
  return `http://${url.hostname}:${port}`;
}

module.exports = { normalizeBangumiProxy };
