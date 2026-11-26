const { override, overrideDevServer } = require('customize-cra');

// Client routes (/agenda) must be served index.html by the dev server, the same
// way the .htaccess in the cPanel package does in production. The dev server's
// historyApiFallback is not picked up under react-app-rewired here, so a small
// middleware does the rewrite: anything that is not a real file, not /api and
// not /health falls through to index.html.
const devServerConfig = () => (config) => {
  const previous = config.setupMiddlewares;
  config.setupMiddlewares = (middlewares, devServer) => {
    if (!devServer) return previous ? previous(middlewares, devServer) : middlewares;
    devServer.app.use((req, res, next) => {
      const url = req.url.split('?')[0];
      const isApi = url.startsWith('/api') || url.startsWith('/health');
      const hasExtension = /\.[a-zA-Z0-9]+$/.test(url);
      if (isApi || hasExtension) return next();
      req.url = '/index.html';
      return next();
    });
    return previous ? previous(middlewares, devServer) : middlewares;
  };
  return config;
};

module.exports = {
  webpack: override(),
  devServer: overrideDevServer(devServerConfig()),
};
