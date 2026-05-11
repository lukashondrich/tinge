const DEFAULT_CONTEXT_LIMIT = 8;
const DEFAULT_CONTEXT_MAX_CHARS = 1800;
const DEFAULT_CONTEXT_MAX_AGE_MS = 60 * 60 * 1000;
const DEFAULT_ENTRY_MAX_CHARS = 280;

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function truncateText(text, maxChars) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function speakerLabel(speaker) {
  return speaker === 'ai' ? 'Tutor' : 'Learner';
}

export function buildRecentConversationContext(utterances = [], options = {}) {
  const {
    limit = DEFAULT_CONTEXT_LIMIT,
    maxChars = DEFAULT_CONTEXT_MAX_CHARS,
    maxAgeMs = DEFAULT_CONTEXT_MAX_AGE_MS,
    entryMaxChars = DEFAULT_ENTRY_MAX_CHARS,
    minTimestamp = -Infinity,
    now = () => Date.now()
  } = options;

  if (!Array.isArray(utterances) || utterances.length === 0) return '';

  const currentTime = typeof now === 'function' ? now() : now;
  const ageCutoff = Number.isFinite(currentTime) ? currentTime - maxAgeMs : -Infinity;
  const timestampCutoff = Math.max(
    ageCutoff,
    Number.isFinite(minTimestamp) ? minTimestamp : -Infinity
  );

  const recent = utterances
    .filter((entry) => {
      const text = cleanText(entry?.text);
      if (!text || text === '...') return false;
      if (!['user', 'ai'].includes(entry?.speaker)) return false;
      if (!Number.isFinite(entry?.timestamp)) return false;
      return entry.timestamp >= timestampCutoff;
    })
    .slice(-Math.max(1, limit));

  if (recent.length === 0) return '';

  const selectedLines = [];
  let selectedChars = 0;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const entry = recent[i];
    const text = truncateText(cleanText(entry.text), entryMaxChars);
    const line = `${speakerLabel(entry.speaker)}: ${text}`;
    const nextChars = selectedChars + line.length + (selectedLines.length ? 1 : 0);
    if (selectedLines.length > 0 && nextChars > maxChars) break;
    selectedLines.unshift(truncateText(line, maxChars));
    selectedChars = Math.min(nextChars, maxChars);
  }

  if (selectedLines.length === 0) return '';

  return [
    'Recent conversation context from this browser. If the realtime session reconnected, continue naturally from this context without mentioning the reconnect:',
    ...selectedLines
  ].join('\n');
}
