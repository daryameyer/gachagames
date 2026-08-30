const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map();

async function requestText(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 EVENTCLOCK/2.0',
      'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function fetchJson(url) {
  const raw = await requestText(url);
  try { return JSON.parse(raw); }
  catch { return JSON.parse(raw.replace(/^\uFEFF/, '')); }
}

function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_TTL) return Promise.resolve(hit.value);
  return loader().then(value => {
    cache.set(key, { time: Date.now(), value });
    return value;
  });
}

function decode(s = '') {
  return s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/&#x27;/gi, "'").replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function absUrl(href, base) { try { return new URL(href, base).href; } catch { return null; } }
function linksFrom(html, base) {
  const out = []; const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi; let m;
  while ((m = re.exec(html))) { const url = absUrl(m[1], base); const title = decode(m[2]); if (url) out.push({ url, title }); }
  return out;
}
function cleanText(html) {
  return decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' '));
}
function firstTitle(html, fallback) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(m[1]).replace(/\s*[|-]\s*(NTE|Infinity Nikki|Arknights:? Endfield).*$/i, '').trim() : fallback;
}
function eventId(base, index) { return encodeURIComponent(`${base}#${index}`); }

const enMonths = {
  january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,
  october:9,november:10,december:11,jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,
  sep:8,sept:8,oct:9,nov:10,dec:11
};
const ruMonths = {
  января:0,февраля:1,марта:2,апреля:3,мая:4,июня:5,июля:6,августа:7,
  сентября:8,октября:9,ноября:10,декабря:11
};

function parseDatePart(s, yearHint, tzHours) {
  s = s.trim().replace(/[–—]/g,'-')
    .replace(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\./gi,'$1')
    .replace(/\s+/g,' ');
  let m = s.match(/([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?(?:[^0-9]{0,20}(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
  if (m) {
    const month=enMonths[m[1].toLowerCase()];
    if(month!==undefined){
      const day=+m[2], year=m[3]?+m[3]:yearHint;
      let hour=m[4]!==undefined?+m[4]:0, minute=m[5]?+m[5]:0;
      if(m[6]){const ap=m[6].toUpperCase();if(ap==='PM'&&hour<12)hour+=12;if(ap==='AM'&&hour===12)hour=0;}
      return new Date(Date.UTC(year,month,day,hour,minute)-tzHours*3600000);
    }
  }
  m=s.match(/(\d{1,2})\s+([А-Яа-яёЁ]+)(?:\s+(\d{4}))?(?:[^0-9]{0,20}(\d{1,2})(?::(\d{2}))?)?/u);
  if(m){
    const month=ruMonths[m[2].toLowerCase()];
    if(month!==undefined){
      const day=+m[1],year=m[3]?+m[3]:yearHint,hour=m[4]?+m[4]:0,minute=m[5]?+m[5]:0;
      return new Date(Date.UTC(year,month,day,hour,minute)-tzHours*3600000);
    }
  }
  m=s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if(m)return new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0))-tzHours*3600000);
  return null;
}

// NTE: the official news labels these windows as server time (UTC+8),
// but the in-game countdown for the user's NTE server is consistently 6 hours later.
// Therefore we interpret NTE event times as UTC+2 when converting to UTC.
// This is intentionally NTE-only; other games keep their own source timezones.
function parseDuration(text,kind){
  const marker=kind==='nte'
    ? '(?:Duration|Длительность|Расписание события|Доступно)'
    : kind==='hsr'
      ? '(?:Event Duration|Event Time|Duration|Длительность|Период события|Время события|Время проведения)'
      : kind==='wuwa'
        ? '(?:Duration|Event Duration|Event Time|Длительность|Время события)'
        : '(?:Event Duration|Event Time|Duration|Длительность)';
  const idx=text.search(new RegExp(marker,'i')); if(idx<0)return null;
  const chunk=text.slice(idx,idx+1200).replace(/\s+/g,' ');
  const yearNow=new Date().getUTCFullYear();
  const tzMatch=chunk.match(/UTC\s*([+-]\d{1,2})(?::(\d{2}))?/i);
  const tz=kind==='nte'?2:(tzMatch?+tzMatch[1]:(kind==='nikki'?-7:8));
  let range=chunk.match(/([A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?(?:[^–—-]{0,80}))\s+[–—-]\s+([A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?(?:[^.]{0,100}))/i);
  if(!range)range=chunk.match(/(?:с\s+)?(\d{1,2}\s+[А-Яа-яёЁ]+(?:\s+\d{4})?(?:[^–—-]{0,100}))\s+(?:до|—|-)\s+(\d{1,2}\s+[А-Яа-яёЁ]+(?:\s+\d{4})?(?:[^.]{0,100}))/u);
  if(!range)range=chunk.match(/(\d{4}\/\d{1,2}\/\d{1,2}(?:\s+\d{1,2}:\d{2})?)\s*(?:-|–|—)\s*(\d{4}\/\d{1,2}\/\d{1,2}(?:\s+\d{1,2}:\d{2})?)/);
  if(!range)return null;
  const years=(range[0].match(/\b20\d{2}\b/g)||[]);
  const year=years.length?+years[0]:yearNow;
  const start=parseDatePart(range[1],year,tz),end=parseDatePart(range[2],year,tz);
  if(!start||!end)return null;
  if(end<start)end.setUTCFullYear(end.getUTCFullYear()+1);
  return {start,end};
}

const wuwaEnglishTitles = {
  "回音盈域": "Bountiful Crescendo",
  "第二索拉・诡影迷踪": "Second Coming of Solaris: Coded Deception",
  "第二索拉·诡影迷踪": "Second Coming of Solaris: Coded Deception",
  "清弦纪流年": "The Strings Remember",
  "若梦仍有回声": "If Dreams Still Reverberate",
  "潮汐觅闻": "Wuthering Exploration: Fogveil Pagoda",
  "烟云赠礼": "Gifts of Drifting Mist",
  "声弦涤荡": "Chord Cleansing",
  "群声共振模拟域": "Resonance Sim Realm",
};
const wuwaEnglishDescriptions = {
  "Bountiful Crescendo": "Complete Simulated Realm and Tacet Field challenges and spend Crystal Waveplates to receive double rewards.",
  "Second Coming of Solaris: Coded Deception": "A brand-new version of Second Coming of Solaris like you have never seen before is coming soon. What are you waiting for? Come and give it a try!",
  "The Strings Remember": "With peace restored to the Land of Xuanfang, you once again return to the peak where Qingxiao lives. She gave you a seven-string qin some time ago. This time, she intends to formally teach you how to play it.",
  "If Dreams Still Reverberate": "The Ivory Gatekeeper has sent you an SOS over WavesLine. The gate in the depths of the Somnoire—the one that should never be opened, the one you once shut—has somehow opened again. Now terrifying Nightmares are once again running rampant in the Somnoire.",
  "Wuthering Exploration: Fogveil Pagoda": "Pioneer Association picked the Fogveil Pagoda as the new theme for Wutherium Geographic magazine.",
  "Gifts of Drifting Mist": "During the event, log in each day and claim the corresponding login reward from the event page.",
  "Chord Cleansing": "Complete Tacet Discord challenges and spend Crystal Waveplates to receive double rewards.",
  "Resonance Sim Realm": "A combat event and an open test of diverse abilities. The Threnodian system continuously provides different interference sources for participants to connect, combine, and explore richer ability structures.",
  "回音盈域": "Complete Simulated Realm and Tacet Field challenges and spend Crystal Waveplates to receive double rewards.",
  "第二索拉・诡影迷踪": "A brand-new version of Second Coming of Solaris like you have never seen before is coming soon. What are you waiting for? Come and give it a try!",
  "第二索拉·诡影迷踪": "A brand-new version of Second Coming of Solaris like you have never seen before is coming soon. What are you waiting for? Come and give it a try!",
  "清弦纪流年": "With peace restored to the Land of Xuanfang, you once again return to the peak where Qingxiao lives. She gave you a seven-string qin some time ago. This time, she intends to formally teach you how to play it.",
  "若梦仍有回声": "The Ivory Gatekeeper has sent you an SOS over WavesLine. The gate in the depths of the Somnoire—the one that should never be opened, the one you once shut—has somehow opened again. Now terrifying Nightmares are once again running rampant in the Somnoire.",
  "潮汐觅闻": "Pioneer Association picked the Fogveil Pagoda as the new theme for Wutherium Geographic magazine.",
  "烟云赠礼": "During the event, log in each day and claim the corresponding login reward from the event page.",
  "声弦涤荡": "Complete Tacet Discord challenges and spend Crystal Waveplates to receive double rewards.",
  "群声共振模拟域": "A combat event and an open test of diverse abilities. The Threnodian system continuously provides different interference sources for participants to connect, combine, and explore richer ability structures.",
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
const zzzChallengeTypes = new Set(['deadly_assault','shiyu_defense','threshold_simulation','annihilation_simulacrum']);
function localizeZZZTitle(title){ const value=String(title??'').trim(); return zzzRussianTitles[value] || value; }
function localizeZZZDesc(title,desc){ const value=String(title??'').trim(); return zzzRussianDescriptions[value] || String(desc??''); }
function hasCJK(value){ return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(String(value??'')); }
function localizeGameTitle(game,title){ const value=String(title??'').trim(); if(game==='wuwa') return wuwaEnglishTitles[value] || (hasCJK(value)?'Wuthering Waves Event':value); if(game==='zzz') return localizeZZZTitle(value); return value; }
function localizeGameDesc(game,title,desc){ const key=String(title??'').trim(); if(game==='wuwa') return wuwaEnglishDescriptions[key] || (hasCJK(desc)?'Wuthering Waves event.':String(desc??'')); if(game==='zzz') return localizeZZZDesc(key,desc); return String(desc??''); }

function normalizeCalendarEvent(raw,game,index,source){
  const id=raw.id??raw.activity_id??raw.event_id??raw.ann_id??`${game}-${index}`;
  const rawTitle=raw.name??raw.title??raw.eventName??raw.activity_name;
  const title=localizeGameTitle(game,rawTitle);
  const desc=localizeGameDesc(game,rawTitle,raw.description??raw.desc??raw.summary??'');
  const startRaw=raw.start_time??raw.startTime??raw.start_at??raw.start;
  const endRaw=raw.end_time??raw.endTime??raw.end_at??raw.end;
  let start=typeof startRaw==='number'?new Date(startRaw*1000):new Date(startRaw);
  let end=typeof endRaw==='number'?new Date(endRaw*1000):new Date(endRaw);
  const challengeType=String(raw.challenge_type||raw.type_name||'').toLowerCase();
  const isZZZChallenge=game==='zzz' && zzzChallengeTypes.has(challengeType);
  if(isZZZChallenge){
    if(!Number.isNaN(start.getTime())) start=new Date(start.getTime()+7*60*60*1000);
    if(!Number.isNaN(end.getTime())) end=new Date(end.getTime()+7*60*60*1000);
  }
  if(!title||Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start)return null;
  return {id:`${source}:${game}:${id}`,game,title:String(title),desc:String(desc),start,end,done:false,source,category:isZZZChallenge?'mode':(raw.category||'event'),challenge_type:isZZZChallenge?challengeType:undefined};
}

const calendarSources={
  genshin:'https://api.ennead.cc/mihoyo/genshin/calendar?lang=ru-ru',
  hsr:'https://api.ennead.cc/mihoyo/starrail/calendar?lang=ru-ru',
  zzz:'https://api.ennead.cc/mihoyo/zenless/calendar?lang=ru-ru',
  wuwa:'https://gamecal.nv5.me/api/events?game=ww',
  endfield:'https://gamecal.nv5.me/api/events?game=endfield'
};

// Второй независимый источник. Он отдаёт именно activities, а не баннеры.
const activitySources={
  genshin:'https://starrailassistant.top/api/v1/activity/ys.json',
  hsr:'https://starrailassistant.top/api/v1/activity/sr.json',
  zzz:'https://starrailassistant.top/api/v1/activity/zzz.json',
  wuwa:'https://starrailassistant.top/api/v1/activity/ww.json',
  nte:'https://starrailassistant.top/api/v1/activity/nte.json'
};

async function calendarEvents(game){
  const url=calendarSources[game]; if(!url) return [];
  return cached(`calendar:${game}`,async()=>{
    try{
      const data=await fetchJson(url);
      const events=Array.isArray(data)?data:(data?.events||data?.data?.events||[]);
      const challenges=game==='zzz' && Array.isArray(data?.challenges)
        ? data.challenges.map(x=>({...x,title:x.name,challenge_type:x.type_name,category:'mode'}))
        : [];
      const list=[...events,...challenges];
      const now=Date.now();
      return list.map((x,i)=>normalizeCalendarEvent(x,game,i,'calendar'))
        .filter(Boolean).filter(e=>e.end.getTime()>now);
    }catch(err){ console.warn('calendar',game,err.message); return []; }
  });
}

async function activityEvents(game){
  const url=activitySources[game]; if(!url) return [];
  return cached(`activity:${game}`,async()=>{
    try{
      const data=await fetchJson(url);
      const list=Array.isArray(data?.activities)?data.activities:(Array.isArray(data)?data:[]);
      const now=Date.now();
      return list.map((x,i)=>{
        const rawTitle=x.name??x.title;
        const title=localizeGameTitle(game,rawTitle);
        const desc=localizeGameDesc(game,rawTitle,x.description??x.desc??'');
        const start=new Date(x.startTime??x.start_time??x.start);
        const end=new Date(x.endTime??x.end_time??x.end);
        if(!title||Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start||end.getTime()<=now)return null;
        return {
          id:`activity:${game}:${i}:${encodeURIComponent(String(title))}`,
          game,title:String(title),desc:String(desc),
          start,end,done:false,source:'activity',url:x.url||''
        };
      }).filter(Boolean);
    }catch(err){ console.warn('activity',game,err.message); return []; }
  });
}

function extractOfficialEvents(text,game,baseUrl){
  const out=[],now=Date.now(),compact=text.replace(/\s+/g,' ');
  const patterns=game==='nikki'
    ? [/\[([^\]]+)\][^\[]{0,500}?(?:Event Duration|Duration):\s*([^\[]+?)(?=\[|$)/gi]
    : game==='nte'
      ? [/(?:[●•]\s*)?(?:"|«)([^"»]+)(?:"|»)[^●•]{0,300}?(?:Duration|Длительность|Доступно):\s*([^●•]+?)(?=●|•|$)/gi]
      : [/(?:\[([^\]]+)\]|(?:Limited-Time Event|Event)\s+["“]([^"”]+)["”])[^.]{0,500}?(?:Event Time|Event Duration|Duration|Период события|Время события|Время проведения):\s*([^●•]+?)(?=\b(?:Event Time|Event Duration|Duration|Период события|Время события|Время проведения)\b|$)/gi];
  for(const re of patterns){
    let m;
    while((m=re.exec(compact))){
      const title=(m[1]||m[2]||'Событие').trim();
      const durationText=m[2]||m[3]||'';
      const duration=parseDuration(`Event Duration ${durationText}`,game);
      if(!duration||duration.end.getTime()<=now)continue;
      out.push({id:`official:${game}:${eventId(baseUrl,m.index)}`,game,title,desc:'Официальное событие',start:duration.start,end:duration.end,done:false,source:'official',url:baseUrl});
    }
  }
  return out;
}

const ENDFIELD_OFFICIAL_SOURCES=[
  'https://endfield.gryphline.com/en-us/news/5200',
  'https://endfield.gryphline.com/en-us/news/4482',
  'https://endfield.gryphline.com/en-us/news/1329',
  'https://endfield.gryphline.com/en-us/news/3831'
];
const OFFICIAL_GAME_CONFIG={
  genshin:{index:'https://genshin.hoyoverse.com/en/news',match:'/en/news/',fallback:'https://genshin.hoyoverse.com/en/news/398'},
  hsr:{index:'https://hsr.hoyoverse.com/ru-ru/',match:'/ru-ru/news/',fallback:'https://hsr.hoyoverse.com/ru-ru/'},
  zzz:{index:'https://zenless.hoyoverse.com/en-us/news',match:'/en-us/news/',fallback:'https://zenless.hoyoverse.com/en-us/news/165414'},
  wuwa:{index:'https://wutheringwaves.kurogames.com/en/main/news',match:'/en/main/news/detail/',fallback:'https://wutheringwaves.kurogames.com/en/main/news/detail/5365'},
  nte:{index:'https://nte.perfectworld.com/ru/article/news/gamenews/index.html',match:'/article/news/gamenews/',fallback:'https://nte.perfectworld.com/ru/article/news/gamenews/20260817/263612.html'},
  nikki:{index:'https://infinitynikki.infoldgames.com/en/news',match:'/en/news/',fallback:'https://infinitynikki.infoldgames.com/en/news/568'},
  endfield:{index:'https://endfield.gryphline.com/en-us/news',match:'/en-us/news/',fallback:ENDFIELD_OFFICIAL_SOURCES[0]}
};

function endfieldAllDateRanges(text){
  const clean=text.replace(/\s+/g,' ').replace(/[–—]/g,' - ');
  const out=[];
  const re=/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}(?:,\s*20\d{2})?(?:\s+at\s+\d{1,2}(?::\d{2})?)?)\s*(?:-|to)\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}(?:,\s*20\d{2})?(?:\s+at\s+\d{1,2}(?::\d{2})?)?)/gi;
  let m; const yearNow=new Date().getUTCFullYear();
  while((m=re.exec(clean))){
    const start=parseDatePart(m[1].replace(/\bat\b/gi,' '),yearNow,8);
    const end=parseDatePart(m[2].replace(/\bat\b/gi,' '),yearNow,8);
    if(start&&end){if(end<start)end.setUTCFullYear(end.getUTCFullYear()+1);out.push({start,end});}
  }
  return out;
}
function endfieldVersionUpdateStart(text){
  const m=text.match(/Asia Server:\s*([A-Za-z]+\s+\d{1,2},\s*20\d{2}\s+at\s+\d{1,2}:\d{2})\s*-\s*([A-Za-z]+\s+\d{1,2},\s*20\d{2}\s+at\s+\d{1,2}:\d{2})/i);
  return m?parseDatePart(m[1],new Date().getUTCFullYear(),8):null;
}
function endfieldDateRange(text){
  const ranges=endfieldAllDateRanges(text);
  if(ranges.length){
    const now=Date.now(),future=ranges.filter(r=>r.end.getTime()>now).sort((a,b)=>a.start-b.start);
    return future[0]||ranges[ranges.length-1];
  }
  return null;
}
function endfieldRelativeRange(raw,articleText=''){
  const clean=raw.replace(/\s+/g,' ').replace(/[–—]/g,' - ');
  const explicit=endfieldAllDateRanges(clean);
  if(explicit.length){
    const future=explicit.filter(r=>r.end.getTime()>Date.now()).sort((a,b)=>a.start-b.start);
    return future[0]||explicit[explicit.length-1];
  }
  if(/after \[[^\]]+\] version update/i.test(clean)){
    const endMatch=clean.match(/(?:-|to)\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},\s*20\d{2}(?:\s+at\s+\d{1,2}(?::\d{2})?)?)/i);
    const end=endMatch?parseDatePart(endMatch[1].replace(/\bat\b/gi,' '),new Date().getUTCFullYear(),8):null;
    const start=articleText?endfieldVersionUpdateStart(articleText):null;
    if(start&&end&&end>start)return {start,end};
  }
  return null;
}
function extractEndfieldEvents(text,baseUrl){
  const now=Date.now(),compact=text.replace(/\s+/g,' ').replace(/[–—]/g,' - '),out=[];
  const sectionMatch=compact.match(/(?:New Events|New Event)[\s:]*([\s\S]*?)(?=Event & Gameplay Updates|Event & Gameplay Update|Acquisition Center Update|$)/i);
  const section=sectionMatch?sectionMatch[1]:compact;
  const re=/(?:^|\s)(?:\d+\.\s*)?(?:\[([^\]]+)\]|["“]([^"”]+)["”])([^]{0,900}?)(?=\s+(?:\d+\.\s*)?(?:\[|["“])|$)/gi;
  let m;
  while((m=re.exec(section))){
    const title=(m[1]||m[2]||'').trim(),body=m[3]||'';
    if(!title)continue;
    const tm=body.match(/Event Time\s*:\s*([^•]+?)(?=\s+·|\s+Event Details|\s+\d+\.|$)/i);
    if(!tm)continue;
    let range=endfieldDateRange(tm[1])||endfieldRelativeRange(tm[1],text);
    const all=endfieldAllDateRanges(tm[1]);
    if(all.length){
      const future=all.filter(r=>r.end.getTime()>now).sort((a,b)=>a.start-b.start);
      if(future.length)range=future[0];
    }
    if(!range||range.end.getTime()<=now)continue;
    out.push({id:`official:endfield:${eventId(baseUrl,m.index)}`,game:'endfield',title,desc:body.replace(/Event Time\s*:[\s\S]*$/i,'').trim().slice(0,500),start:range.start,end:range.end,done:false,source:'official',url:baseUrl});
  }
  return out;
}
async function scrapeOfficial(game){
  const cfg=OFFICIAL_GAME_CONFIG[game];
  const now=Date.now(); let links=[];
  try{
    const html=await requestText(cfg.index);
    links=linksFrom(html,cfg.index).filter(x=>x.url.includes(cfg.match));
  }catch(err){console.warn(game,'index unavailable:',err.message);}
  const unique=[...new Map(links.map(x=>[x.url,x])).values()];
  if(game==='endfield'){
    for(const url of ENDFIELD_OFFICIAL_SOURCES) if(!unique.some(x=>x.url===url)) unique.unshift({url,title:''});
  }else if(cfg.fallback&&!unique.some(x=>x.url===cfg.fallback)) unique.unshift({url:cfg.fallback,title:''});
  const selected=unique.slice(0,30);
  const results=await Promise.all(selected.map(async link=>{
    try{
      const article=await requestText(link.url);
      const text=cleanText(article);
      const extracted=game==='endfield'?extractEndfieldEvents(text,link.url):extractOfficialEvents(text,game,link.url);
      if(extracted.length)return extracted;
      const duration=parseDuration(text,game);
      if(!duration||duration.end.getTime()<=now)return[];
      const title=firstTitle(article,link.title||'Событие');
      return [{id:`official:${game}:${eventId(link.url,0)}`,game,title,desc:'Официальное событие',start:duration.start,end:duration.end,done:false,source:'official',url:link.url}];
    }catch(err){console.warn(game,link.url,err.message);return[];}
  }));
  const events=results.flat();
  return [...new Map(events.map(e=>[`${e.title}|${e.end.toISOString()}`,e])).values()];
}

async function officialEvents(game){
  return scrapeOfficial(game).catch(()=>[]);
}

async function snapshotEvents(game){
  return cached(`snapshot:${game}`,async()=>{
    try{
      const data=await fetchJson('https://raw.githubusercontent.com/daryameyer/gachagames/main/events.json');
      const list=Array.isArray(data?.events)?data.events:[];
      return list.filter(e=>e&&e.game===game).map((e,i)=>{
        const start=new Date(e.start),end=new Date(e.end);
        if(!e.title||Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start||end.getTime()<=Date.now())return null;
        return {id:`snapshot:${e.id||`${game}:${i}`}`,game,title:String(e.title),desc:String(e.desc||''),start,end,done:false,source:'snapshot',url:e.url||''};
      }).filter(Boolean);
    }catch(err){console.warn('snapshot unavailable:',err.message);return[];}
  });
}

function dedupeEvents(...groups){
  const byKey=new Map();
  for(const group of groups){
    for(const e of group||[]){
      if(!e||!e.title||!e.end)continue;
      const end=new Date(e.end);
      if(Number.isNaN(end.getTime())||end.getTime()<=Date.now())continue;
      const key=`${e.game}|${String(e.title).trim().toLowerCase()}|${end.toISOString()}`;
      const prev=byKey.get(key);
      if(!prev||priority(e.source)>priority(prev.source))byKey.set(key,e);
    }
  }
  return [...byKey.values()].sort((a,b)=>new Date(a.end)-new Date(b.end));
}
function priority(source){
  return source==='official'?4:source==='activity'?3:source==='calendar'?2:source==='snapshot'?1:0;
}

async function liveEvents(game){
  const [calendar,activity,official]=await Promise.all([
    calendarEvents(game),
    activityEvents(game),
    officialEvents(game)
  ]);
  return dedupeEvents(calendar,activity,official);
}

async function getEvents(game){
  const live=await liveEvents(game);
  if(live.length)return {events:live,usedSnapshot:false};
  const backup=await snapshotEvents(game);
  return {events:backup,usedSnapshot:true};
}

function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store',
      'Access-Control-Allow-Origin':'*'
    }
  });
}

export default {
  async fetch(request, env) {
    const u=new URL(request.url);
    try{
      if(u.pathname==='/api/events'){
        const game=u.searchParams.get('game');
        const allowed=['genshin','hsr','zzz','wuwa','endfield','nte','nikki'];
        if(!allowed.includes(game))return json({ok:false,error:'unknown game'},400);
        const result=await getEvents(game);
        return json({
          ok:true,
          game,
          source:result.usedSnapshot?'events.json':'live',
          updatedAt:new Date().toISOString(),
          usedSnapshot:result.usedSnapshot,
          events:result.events
        });
      }
      if(u.pathname==='/api/official-events'){
        const game=u.searchParams.get('game');
        if(!['nte','nikki','endfield'].includes(game))return json({ok:false,error:'unknown game'},400);
        const result=await getEvents(game);
        return json({
          ok:true,
          game,
          source:result.usedSnapshot?'events.json':'live',
          updatedAt:new Date().toISOString(),
          usedSnapshot:result.usedSnapshot,
          events:result.events
        });
      }
      if(u.pathname==='/api/health'){
        return json({
          ok:true,
          time:new Date().toISOString(),
          sources:['activity-api','calendar-api','official','events.json']
        });
      }
      return env.ASSETS.fetch(request);
    }catch(e){
      console.error(e);
      return json({ok:false,error:e?.message||String(e)},500);
    }
  }
};
