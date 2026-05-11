import crypto from 'node:crypto';

const DEFAULT_STUN_URLS = ['stun:stun.l.google.com:19302'];
const DEFAULT_TURN_TTL_SECONDS = 3600;
const VALID_ICE_TRANSPORT_POLICIES = new Set(['all', 'relay']);
const PLACEHOLDER_ICE_URL_PATTERN = /<[^>]+>|real-turn-host|your-turn-host|turn\.example\.com/i;

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

function isPlaceholderIceUrl(url) {
  return PLACEHOLDER_ICE_URL_PATTERN.test(String(url || ''));
}

function normalizeIceUrls(urls, logger, sourceLabel) {
  const originalUrls = Array.isArray(urls) ? urls : [urls];
  const filteredUrls = originalUrls.filter((url) => {
    if (!url) return false;
    if (isPlaceholderIceUrl(url)) {
      logger.warn(`${sourceLabel} contains placeholder ICE URL "${url}"; ignoring it`);
      return false;
    }
    return true;
  });

  if (Array.isArray(urls)) return filteredUrls;
  return filteredUrls[0] || null;
}

function normalizeIceServers(iceServers, logger, sourceLabel) {
  return iceServers
    .map((server) => {
      if (!server || !server.urls) return null;
      const normalizedUrls = normalizeIceUrls(server.urls, logger, sourceLabel);
      if (!normalizedUrls || (Array.isArray(normalizedUrls) && normalizedUrls.length === 0)) {
        return null;
      }
      return { ...server, urls: normalizedUrls };
    })
    .filter(Boolean);
}

function normalizeIceTransportPolicy(value, logger) {
  const policy = String(value || 'all').trim().toLowerCase();
  if (VALID_ICE_TRANSPORT_POLICIES.has(policy)) return policy;
  logger.warn(`RTC_ICE_TRANSPORT_POLICY must be "all" or "relay"; received "${value}", using "all"`);
  return 'all';
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
  const stunUrls = normalizeIceUrls(
    configuredStunUrls.length > 0 ? configuredStunUrls : DEFAULT_STUN_URLS,
    logger,
    'RTC_STUN_URLS'
  );
  const iceTransportPolicy = normalizeIceTransportPolicy(env.RTC_ICE_TRANSPORT_POLICY, logger);
  const iceServers = [];

  if (!['0', 'false', 'no'].includes(String(env.RTC_ENABLE_STUN || 'true').toLowerCase())) {
    if (stunUrls.length > 0) {
      iceServers.push({ urls: stunUrls });
    }
  }

  iceServers.push(...normalizeIceServers(
    parseJsonIceServers(env.RTC_ICE_SERVERS_JSON, logger),
    logger,
    'RTC_ICE_SERVERS_JSON'
  ));

  const turnUrls = normalizeIceUrls(parseList(env.TURN_URLS), logger, 'TURN_URLS');
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
      return { iceServers, iceTransportPolicy, expiresAt, ttlSeconds };
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

  if (env.TURN_URLS && turnUrls.length === 0) {
    logger.warn('TURN_URLS did not include any usable TURN URL; WebRTC will fall back to non-relay candidates');
  }

  return { iceServers, iceTransportPolicy, expiresAt: null, ttlSeconds: null };
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
