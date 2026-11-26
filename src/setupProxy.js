/**
 * Dev-server proxy: the browser talks to the site on :3000, the API runs on
 * :4000, and /api + /health are forwarded so the forms work locally without
 * setting REACT_APP_API_URL.
 *
 * In production there is no proxy: set REACT_APP_API_URL to the API's URL and
 * rebuild (see api/README.md).
 */
const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupProxy(app) {
  const target = process.env.API_PROXY_TARGET || "http://localhost:4000";

  app.use(
    createProxyMiddleware(["/api", "/health", "/uploads"], {
      target,
      changeOrigin: true,
      logLevel: "warn",
    })
  );
};
