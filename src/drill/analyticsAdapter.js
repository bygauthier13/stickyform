// AnalyticsAdapter — structured, local-only events for the journey.
//
// Nothing leaves the page unless a sink is connected later (e.g. a call to the
// brand's analytics tool). Events carry question and option identifiers only:
// free text, its length or anything typed is never recorded. Duplicate events
// (a double click, a re-render) are dropped with `onceKey`.

export const EVENT_NAMES = [
  'experience_opened',
  'audio_enabled',
  'survey_started',
  'question_viewed',
  'answer_submitted',
  'survey_completed',
  'export_started',
  'export_completed',
  'export_failed',
];

// properties an event may carry; anything else is dropped
const ALLOWED_PROPS = new Set(['question_id', 'question_index', 'option_id', 'answered', 'skipped', 'revised', 'sound', 'seconds', 'bytes', 'reason', 'run']);

function clean(props) {
  const out = {};
  for (const [k, v] of Object.entries(props || {})) {
    if (!ALLOWED_PROPS.has(k)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 48);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v * 100) / 100;
    else if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/**
 * @param {{ sink?: (event:object)=>void, debug?: boolean, now?: ()=>string }} [o]
 */
export function createAnalytics({ sink = null, debug = false, now = () => new Date().toISOString() } = {}) {
  const log = [];
  const seen = new Set();
  let out = sink;
  return {
    /**
     * Record an event. Returns false if it was unknown or a duplicate.
     * @param {string} name
     * @param {object} [props]
     * @param {{ onceKey?: string }} [o]
     */
    track(name, props = {}, { onceKey } = {}) {
      if (!EVENT_NAMES.includes(name)) return false;
      if (onceKey !== undefined) {
        const key = `${name}|${onceKey}`;
        if (seen.has(key)) return false;
        seen.add(key);
      }
      const event = { name, at: now(), ...clean(props) };
      log.push(event);
      if (log.length > 400) log.shift();
      if (debug) console.debug('[analytics]', event);
      try {
        out?.(event);
      } catch {
        /* a broken sink must never break the experience */
      }
      return true;
    },
    /** A copy of what was recorded in this page view. */
    events: () => log.map((e) => ({ ...e })),
    /** Connect a destination later (e.g. a consented analytics tool). */
    setSink(fn) {
      out = typeof fn === 'function' ? fn : null;
    },
  };
}
