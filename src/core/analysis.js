import { store } from './store.js';
import { config } from '../config.js';
import { ALGO, TARGET_FOLLOWERS } from './algo.js';

/**
 * ANALYSIS — real, measured analytics (not vibes).
 *
 * Every number here is computed from persisted history:
 *   - followers/day (real growth velocity from post gains)
 *   - engagement rate (likes / followers)
 *   - virality stats (avg + best score from scored posts)
 *   - posting cadence (posts/day actual)
 *   - ETA to 1,000,000 followers at current velocity
 *
 * The dashboard renders this as an honest, professional readout:
 * what's compounding, what's stalled, and the run-rate projection.
 */

const DAY = 86400000;

function postsPerDay(platform, posts) {
  const mine = posts.filter((p) => p.platform === platform);
  if (!mine.length) return 0;
  const span = (Date.now() - Math.min(...mine.map((p) => p.ts))) / DAY;
  return span > 0 ? +(mine.length / span).toFixed(2) : mine.length;
}

export function analyze() {
  const totals = store.getTotals();
  const target = store.state.settings.target || TARGET_FOLLOWERS;
  const posts = store.state.posts.slice(0, 120);
  const platforms = [];

  for (const [name, st] of Object.entries(store.state.platforms)) {
    const mine = posts.filter((p) => p.platform === name);
    const gains = mine.map((p) => p.gain || 0).filter((g) => g > 0);
    const recent = mine.filter((p) => Date.now() - p.ts < 7 * DAY);
    const recentGains = recent.map((p) => p.gain || 0).filter((g) => g > 0);

    const followers = st.followers || 0;
    const growthPerDay = recentGains.length
      ? +(recentGains.reduce((a, b) => a + b, 0) / Math.max(0.2, (7 * DAY) / DAY)).toFixed(1)
      : 0;

    const eng = st.engagement || 0;
    const vir = { scored: 0, sum: 0, best: 0 };
    for (const p of mine) {
      if (typeof p.virality === 'number') {
        vir.scored += 1;
        vir.sum += p.virality;
        vir.best = Math.max(vir.best, p.virality);
      }
    }

    platforms.push({
      name,
      followers,
      postsToday: postsPerDay(name, posts),
      growthPerDay,
      engagement: +eng.toFixed(1),
      avgVirality: vir.scored ? +(vir.sum / vir.scored).toFixed(0) : null,
      bestVirality: vir.best || null,
      scored: vir.scored,
      etaDays: growthPerDay > 0 ? Math.max(0, Math.ceil((target - followers) / growthPerDay)) : null,
    });
  }

  // velocity & projection across the whole portfolio
  const totalGainsRecent = posts.filter((p) => Date.now() - p.ts < 7 * DAY).map((p) => p.gain || 0).filter((g) => g > 0);
  const velocity = totalGainsRecent.length
    ? +(totalGainsRecent.reduce((a, b) => a + b, 0) / 7).toFixed(1)
    : 0;
  const remaining = Math.max(0, target - totals.followers);
  const etaDays = velocity > 0 ? Math.max(0, Math.ceil(remaining / velocity)) : null;

  const compounding = platforms.filter((p) => p.growthPerDay > 0).length;
  const stalled = platforms.filter((p) => p.followers > 0 && p.growthPerDay <= 0).length;

  return {
    target,
    current: totals.followers,
    remaining,
    velocityPerDay: velocity,
    etaDays,
    etl: etaDays ? new Date(Date.now() + etaDays * DAY).toISOString().slice(0, 10) : null,
    platforms,
    compounding,
    stalled,
    engagementAvg: platforms.length ? +((platforms.reduce((a, p) => a + p.engagement, 0) / platforms.length)).toFixed(1) : 0,
    generatedAt: Date.now(),
  };
}

export const analysisEngine = { analyze };