import crypto from 'node:crypto';

const DEFAULT_STUN_URLS = ['stun:stun.l.google.com:19302'];
const DEFAULT_TURN_TTL_SECONDS = 3600;

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseJsonIceServers(rawValue, logger) {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      logger.warn('RTC_ICE_SERVERS_JSON must be an array; ignoring value');
      return [];
    }
    return parsed.filter((entry) => entry && entry.urls);
  } catch (err) {
    logger.warn('Failed to parse RTC_ICE_SERVERS_JSON; ignoring value:', err.message);
    return [];
  }
}

function buildTurnCredentials({
  sharedSecret,
  ttlSeconds,
  usernamePrefix,
  nowSeconds
}) {
  const expiresAt = nowSeconds + ttlSeconds;
  const username = `${expiresAt}:${usernamePrefix}`;
  const credential = crypto
    .createHmac('sha1', sharedSecret)
    .update(username)
    .digest('base64');
  return { username, credential, expiresAt };
}

export function buildRtcIceConfig({
  env = process.env,
  nowSeconds = Math.floor(Date.now() / 1000),
  logger = console
} = {}) {
  const configuredStunUrls = parseList(env.RTC_STUN_URLS);
  const stunUrls = configuredStunUrls.length > 0 ? configuredStunUrls : DEFAULT_STUN_URLS;
  const iceServers = [];

  if (!['0', 'false', 'no'].includes(String(env.RTC_ENABLE_STUN || 'true').toLowerCase())) {
    iceServers.push({ urls: stunUrls });
  }

  iceServers.push(...parseJsonIceServers(env.RTC_ICE_SERVERS_JSON, logger));

  const turnUrls = parseList(env.TURN_URLS);
  if (turnUrls.length > 0) {
    const staticUsername = env.TURN_USERNAME;
    const staticCredential = env.TURN_CREDENTIAL;
    const sharedSecret = env.TURN_SHARED_SECRET;

    if (sharedSecret) {
      const ttlSeconds = Math.max(
        60,
        Number(env.TURN_TTL_SECONDS || DEFAULT_TURN_TTL_SECONDS) || DEFAULT_TURN_TTL_SECONDS
      );
      const { username, credential, expiresAt } = buildTurnCredentials({
        sharedSecret,
        ttlSeconds,
        usernamePrefix: env.TURN_USERNAME_PREFIX || 'tinge',
        nowSeconds
      });
      iceServers.push({
        urls: turnUrls,
        username,
        credential
      });
      return { iceServers, expiresAt, ttlSeconds };
    }

    if (staticUsername && staticCredential) {
      iceServers.push({
        urls: turnUrls,
        username: staticUsername,
        credential: staticCredential
      });
    } else {
      logger.warn('TURN_URLS configured without TURN_SHARED_SECRET or TURN_USERNAME/TURN_CREDENTIAL');
    }
  }

  return { iceServers, expiresAt: null, ttlSeconds: null };
}

export function createRtcConfigHandler({
  env = process.env,
  logger = console,
  nowSeconds = () => Math.floor(Date.now() / 1000)
} = {}) {
  return (req, res) => {
    const config = buildRtcIceConfig({
      env,
      logger,
      nowSeconds: nowSeconds()
    });
    return res.json(config);
  };
}
