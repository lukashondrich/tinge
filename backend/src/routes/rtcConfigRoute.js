import crypto from 'node:crypto';

const DEFAULT_STUN_URLS = ['stun:stun.l.google.com:19302'];
const DEFAULT_TURN_TTL_SECONDS = 3600;
const VALID_ICE_TRANSPORT_POLICIES = new Set(['all', 'relay']);
const DEFAULT_CLOUDFLARE_TURN_API_BASE = 'https://rtc.live.cloudflare.com/v1/turn/keys';
const DEFAULT_CLOUDFLARE_TURN_TTL_SECONDS = 86400;
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

function isTruthyFlag(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

// On UDP-hostile networks the browser's UDP relay allocations hang and can
// crowd out the working TLS-relay candidate before the non-trickle offer is
// sent, so ICE never connects. Dropping the UDP transports leaves only
// TCP/TLS relay (incl. turns:443), which gathers fast and connects. Also
// trims the URL count below the "5+ servers slows discovery" threshold.
function filterToTcpRelay(iceServers) {
  return iceServers
    .map((entry) => {
      const urls = (Array.isArray(entry.urls) ? entry.urls : [entry.urls])
        .filter((u) => typeof u === 'string' && !u.includes('transport=udp'));
      return urls.length ? { ...entry, urls } : null;
    })
    .filter(Boolean);
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

// Cloudflare TURN mints short-lived credentials on demand and runs on its
// anycast network with TURN-over-TLS on 443 (and TURN over port 53), which
// reaches through NAT/UDP-hostile networks that block specialized relays.
// The allocation is kept alive by the relay, so it survives the NAT-binding
// timeouts that drop direct ICE paths during silence between turns.
export async function fetchCloudflareIceServers({
  env = process.env,
  fetchImpl,
  logger = console,
  nowSeconds = Math.floor(Date.now() / 1000)
} = {}) {
  const keyId = env.CLOUDFLARE_TURN_KEY_ID;
  const apiToken = env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !apiToken) return null;
  if (typeof fetchImpl !== 'function') {
    logger.warn('Cloudflare TURN configured but no fetch implementation is available');
    return null;
  }

  const base = env.CLOUDFLARE_TURN_API_BASE || DEFAULT_CLOUDFLARE_TURN_API_BASE;
  const ttlSeconds = Math.max(
    60,
    Number(env.CLOUDFLARE_TURN_TTL_SECONDS || DEFAULT_CLOUDFLARE_TURN_TTL_SECONDS)
      || DEFAULT_CLOUDFLARE_TURN_TTL_SECONDS
  );
  const url = `${base}/${keyId}/credentials/generate-ice-servers`;

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ttl: ttlSeconds })
    });

    if (!response.ok) {
      let detail = '';
      try {
        detail = await response.text();
      } catch (err) {
        detail = '';
      }
      logger.warn(`Cloudflare TURN credential request failed: ${response.status} ${detail.slice(0, 120)}`);
      return null;
    }

    const data = await response.json();
    if (!Array.isArray(data?.iceServers) || data.iceServers.length === 0) {
      logger.warn('Cloudflare TURN response did not include iceServers');
      return null;
    }

    return {
      iceServers: data.iceServers,
      ttlSeconds,
      expiresAt: nowSeconds + ttlSeconds
    };
  } catch (err) {
    logger.warn(`Cloudflare TURN credential request error: ${err.message}`);
    return null;
  }
}

export function createRtcConfigHandler({
  env = process.env,
  logger = console,
  nowSeconds = () => Math.floor(Date.now() / 1000),
  fetchImpl = typeof globalThis.fetch === 'function'
    ? (...args) => globalThis.fetch(...args)
    : null
} = {}) {
  return async (req, res) => {
    const now = nowSeconds();

    // Prefer Cloudflare-minted credentials when configured; fall back to the
    // env-based STUN/TURN config if it is unset or the request fails.
    const cloudflare = await fetchCloudflareIceServers({
      env,
      fetchImpl,
      logger,
      nowSeconds: now
    });
    if (cloudflare) {
      const iceServers = isTruthyFlag(env.RTC_TURN_TCP_ONLY)
        ? filterToTcpRelay(cloudflare.iceServers)
        : cloudflare.iceServers;
      return res.json({
        iceServers,
        iceTransportPolicy: normalizeIceTransportPolicy(env.RTC_ICE_TRANSPORT_POLICY, logger),
        expiresAt: cloudflare.expiresAt,
        ttlSeconds: cloudflare.ttlSeconds
      });
    }

    const config = buildRtcIceConfig({
      env,
      logger,
      nowSeconds: now
    });
    return res.json(config);
  };
}
