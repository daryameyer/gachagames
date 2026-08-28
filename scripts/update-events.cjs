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


const zzzRussianTitles = {
  "恰浪花逐夏而至": "Дары прибоя",
  "咔滋酥脆出餐计划": "Прожарка с корочкой",
  "极危通缉与悠游假期": "Отпуск в розыске",
  "实战特训-三倍悬赏": "Практическая тренировка — тройная награда",
  "云端礼赠": "Подарки из облаков",
  "「嗯呢」大派送！": "Большая раздача «Эн-эн»!",
  "玛瑟尔周年馈礼": "Подарки к годовщине Марселя",
  "法厄同年度大揭秘": "Годовой итог Фаэтона",
  "潛能预演·狩猎游戏": "Прелюдия потенциала · Охотничья игра",
  "叮咚！见习邮差派件中": "Динь-дон! Стажёр-почтальон доставляет посылки",
  "末日幻影•兵锋骑士": "Апокалиптическая тень: Рыцарь клинка",
  "末日幻影·兵锋骑士": "Апокалиптическая тень: Рыцарь клинка"
};
const zzzRussianDescriptions = {
  "恰浪花逐夏而至": "Тот, кто отправился из небес к океану, получит подарок от волн — незабываемое приключение в сиянии огня и целое незабываемое лето.",
  "咔滋酥脆出餐计划": "Всё самое вкусное — к вашему столу! Особое кулинарное мероприятие уже началось. Встречаемся на площади Люмин.",
  "极危通缉与悠游假期": "Даже во время каникул разыскиваемый преступник должен выглядеть идеально для камеры. Делайте снимки и получайте награды.",
  "实战特训-三倍悬赏": "В период события награды за испытания в Зале боевой симуляции увеличены втрое.",
  "云端礼赠": "Войдите в игру 7 дней во время события и получите 10 зашифрованных мастер-лент.",
  "「嗯呢」大派送！": "Войдите в игру 7 дней во время события и получите 10 зашифрованных мастер-лент и 10 купонов банбу.",
  "玛瑟尔周年馈礼": "Получите ограниченного S-агента, S-двигатель, много полихромов и другие награды.",
  "法厄同年度大揭秘": "Специальная программа с годовыми итогами Фаэтона и важными событиями прошедшего года.",
  "潛能预演·狩猎游戏": "Новая охотничья игра начинается. Испытайте себя в новом раунде охоты.",
  "叮咚！见习邮差派件中": "Почтовая служба «Почта желаний» доставляет мечты. Количество наград ограничено.",
  "末日幻影•兵锋骑士": "Пройдите испытания Апокалиптической тени и получите награды за боевые достижения.",
  "末日幻影·兵锋骑士": "Пройдите испытания Апокалиптической тени и получите награды за боевые достижения."
};

const wuwaEnglishTitles = {
  '回音盈域': 'Bountiful Crescendo',
  '第二索拉・诡影迷踪': 'Second Coming of Solaris: Coded Deception',
  '第二索拉·诡影迷踪': 'Second Coming of Solaris: Coded Deception',
  '清弦纪流年': 'The Strings Remember',
  '若梦仍有回声': 'If Dreams Still Reverberate',
  '潮汐觅闻': 'Wuthering Exploration: Fogveil Pagoda',
  '烟云赠礼': 'Gifts of Drifting Mist',
  '声弦涤荡': 'Chord Cleansing',
  '群声共振模拟域': 'Resonance Sim Realm'
};
function localizeGameTitle(game,title){
  const value=String(title??'').trim();
  if(game==='wuwa') return wuwaEnglishTitles[value] || value;
  if(game==='zzz') return zzzRussianTitles[value] || value;
  return value;
}

function toEvent(x, game, i, source) {
  const title = localizeGameTitle(game, x?.name ?? x?.title ?? x?.eventName ?? x?.activity_name);
  const rawDesc = x?.description ?? x?.desc ?? x?.summary ?? '';
  const desc = game==='zzz' ? (zzzRussianDescriptions[String(x?.name ?? x?.title ?? '').trim()] || rawDesc) : rawDesc;
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
