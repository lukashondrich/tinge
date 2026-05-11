export function createCorsOptions({
  frontendUrl,
  logger = console
} = {}) {
  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const allowedOrigins = [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:8080',
        'http://127.0.0.1:8080',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        frontendUrl,
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
        /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,
        /\.railway\.app$/,
        /\.up\.railway\.app$/
      ].filter(Boolean);

      const isAllowed = allowedOrigins.some((allowedOrigin) => {
        if (typeof allowedOrigin === 'string') {
          return origin === allowedOrigin;
        }
        if (allowedOrigin instanceof RegExp) {
          return allowedOrigin.test(origin);
        }
        return false;
      });

      if (isAllowed) {
        callback(null, true);
        return;
      }

      logger.log(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  };
}
