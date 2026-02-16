export function createRequestLogger({
  logger = console,
  now = () => new Date()
} = {}) {
  return function requestLogger(req, res, next) {
    logger.log(`[${now().toISOString()}] ${req.method} ${req.url}`);
    next();
  };
}
