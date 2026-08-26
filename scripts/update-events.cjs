const fs = require('node:fs/promises');

const BASE = process.env.EVENTCLOCK_API || 'https://gachagames.dasha-lerova.workers.dev';

const SOURCES = {
  genshin: [
    'https://api.ennead.cc/mihoyo/genshin/calendar?lang=ru-ru',
    'https://starrailassistant.top/api/v1/activity/ys.json'
  ],
  hsr: [
    'https://api.ennead.cc/mihoyo/starrail/calendar?lang=ru-ru',
    'https://starrailassistant.top/api/v1/activity/sr.json'
  ],
  zzz: [
    'https://api.ennead.cc/mihoyo/zenless/calendar?lang=ru-ru',
    'https://starrailassistant.top/api/v1/activity/zzz.json'
  ],
  wuwa: [
    'https://gamecal.nv5.me/api/events?game=ww',
    'https://starrailassistant.top/api/v1/activity/ww.json'
  ],
  nte: [
    'https://starrailassistant.top/api/v1/activity/nte.json'
  ]
};

const GAMES = ['genshin','hsr','zzz','wuwa','endfield','nte','nikki'];

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function toEvent(x, game, i, source) {
  const title = x?.name ?? x?.title ?? x?.eventName ?? x?.activity_name;
  const desc = x?.description ?? x?.desc ?? x?.summary ?? '';
  const startRaw = x?.start_time ?? x?.startTime ?? x?.start_at ?? x?.start;
  const endRaw = x?.end_time ?? x?.endTime ?? x?.end_at ?? x?.end;
  const start = typeof startRaw === 'number' ? new Date(startRaw * 1000) : new Date(startRaw);
  const end = typeof endRaw === 'number' ? new Date(endRaw * 1000) : new Date(endRaw);
  if (!title || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start || end.getTime() <= Date.now()) return null;
  return {
    id: `${source}:${game}:${x?.id ?? x?.activity_id ?? i}`,
    game,
    title: String(title),
    desc: String(desc),
    start: start.toISOString(),
    end: end.toISOString(),
    done: false,
    source,
    url: x?.url || x?.link || ''
  };
}

function activityList(data) {
  return Array.isArray(data?.activities) ? data.activities : Array.isArray(data) ? data : [];
}
function calendarList(data) {
  return Array.isArray(data) ? data : (data?.events || data?.data?.events || []);
}

function dedupe(events) {
  const map = new Map();
  for (const e of events) {
    const key = `${e.game}|${e.title.trim().toLowerCase()}|${e.end}`;
    if (!map.has(key)) map.set(key, e);
  }
  return [...map.values()].sort((a,b) => new Date(a.end) - new Date(b.end));
}

async function fetchLiveGame(game) {
  if (SOURCES[game]) {
    const settled = await Promise.allSettled(SOURCES[game].map(async (url) => {
      const data = await fetchJson(url);
      const isActivity = url.includes('starrailassistant.top');
      const list = isActivity ? activityList(data) : calendarList(data);
      return list.map((x,i) => toEvent(x, game, i, isActivity ? 'activity' : 'calendar')).filter(Boolean);
    }));
    return dedupe(settled.filter(x => x.status === 'fulfilled').flatMap(x => x.value));
  }

  // Endfield/Nikki: reuse the Worker's official scraper.
  const data = await fetchJson(`${BASE}/api/official-events?game=${game}`);
  return dedupe((Array.isArray(data?.events) ? data.events : []).map((x,i) => toEvent(x, game, i, x.source || 'official')).filter(Boolean));
}

async function readPrevious() {
  try {
    const old = JSON.parse(await fs.readFile('events.json', 'utf8'));
    return Array.isArray(old?.events) ? old.events : [];
  } catch {
    return [];
  }
}

async function main() {
  const previous = await readPrevious();
  const previousByGame = Object.fromEntries(GAMES.map(g => [g, previous.filter(e => e.game === g)]));

  const results = await Promise.allSettled(GAMES.map(fetchLiveGame));
  const all = [];
  const games = {};

  for (let i=0; i<GAMES.length; i++) {
    const game = GAMES[i];
    const r = results[i];

    if (r.status === 'fulfilled' && r.value.length) {
      games[game] = { ok: true, count: r.value.length, usedPrevious: false };
      all.push(...r.value);
    } else {
      // A temporary outage must not erase a previously valid snapshot.
      const backup = previousByGame[game] || [];
      games[game] = { ok: false, count: backup.length, usedPrevious: backup.length > 0 };
      all.push(...backup);
      if (r.status === 'rejected') console.warn(`${game}: ${r.reason?.message || r.reason}`);
    }
  }

  if (!all.length) throw new Error('No events available from live sources or previous snapshot');

  const output = {
    ok: true,
    updatedAt: new Date().toISOString(),
    games,
    events: dedupe(all)
  };

  await fs.writeFile('events.json', JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${output.events.length} events`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

