const fs=require('fs');
const path=require('path');
const http=require('http');
const https=require('https');
const {URL}=require('url');

const ROOT=process.cwd();
const PORT=3000;
const CACHE_TTL=5*60*1000;
const cache=new Map();

function requestText(url,redirects=0){
  return new Promise((resolve,reject)=>{
    if(redirects>5) return reject(new Error('too many redirects'));
    const target=new URL(url);
    const lib=target.protocol==='http:'?http:https;
    const req=lib.get(target,{headers:{
      'User-Agent':'Mozilla/5.0 EVENTCLOCK/1.1',
      'Accept':'text/html,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language':'en-US,en;q=0.9,ru;q=0.8'
    }},res=>{
      if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){
        const next=new URL(res.headers.location,target).href;
        res.resume();
        return requestText(next,redirects+1).then(resolve,reject);
      }
      let data='';
      res.setEncoding('utf8');
      res.on('data',c=>data+=c);
      res.on('end',()=>res.statusCode>=200&&res.statusCode<300?resolve(data):reject(new Error(`HTTP ${res.statusCode}`)));
    });
    req.setTimeout(8000,()=>req.destroy(new Error('timeout')));
    req.on('error',reject);
  });
}

async function fetchJson(url){
  const raw=await requestText(url);
  try{return JSON.parse(raw)}catch{return JSON.parse(raw.replace(/^\uFEFF/,''))}
}
function cached(key,loader){
  const hit=cache.get(key);
  if(hit&&Date.now()-hit.time<CACHE_TTL)return Promise.resolve(hit.value);
  return loader().then(value=>{cache.set(key,{time:Date.now(),value});return value;});
}

function decode(s=''){
  return s.replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&#x27;/gi,"'").replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
}
function absUrl(href,base){try{return new URL(href,base).href}catch{return null}}
function linksFrom(html,base){
  const out=[];const re=/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;
  while((m=re.exec(html))){const url=absUrl(m[1],base);const title=decode(m[2]);if(url)out.push({url,title});}
  return out;
}
function cleanText(html){return decode(html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' '));}
function firstTitle(html,fallback){
  const m=html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?decode(m[1]).replace(/\s*[|-]\s*(NTE|Infinity Nikki|Arknights:? Endfield).*$/i,'').trim():fallback;
}

const enMonths={january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11};
const ruMonths={января:0,февраля:1,марта:2,апреля:3,мая:4,июня:5,июля:6,августа:7,сентября:8,октября:9,ноября:10,декабря:11};
const zhMonths={};
function parseDatePart(s,yearHint,tzHours){
  s=s.trim().replace(/[–—]/g,'-').replace(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\./gi,'$1').replace(/\s+/g,' ');
  let m=s.match(/([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?(?:[^0-9]{0,20}(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
  if(m){
    const month=enMonths[m[1].toLowerCase()];
    if(month!==undefined){
      const day=+m[2],year=m[3]?+m[3]:yearHint;let hour=m[4]!==undefined?+m[4]:0,minute=m[5]?+m[5]:0;
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
  if(m){return new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0))-tzHours*3600000)}
  return null;
}

function parseDuration(text,kind){
  const marker=kind==='nte'?'(?:Duration|Длительность|Расписание события|Доступно)':'(?:Event Duration|Event Time|Duration|Event Time|Длительность)';
  const idx=text.search(new RegExp(marker,'i'));
  if(idx<0)return null;
  const chunk=text.slice(idx,idx+1200).replace(/\s+/g,' ');
  const yearNow=new Date().getUTCFullYear();
  const tzMatch=chunk.match(/UTC\s*([+-]\d{1,2})(?::(\d{2}))?/i);
  const tz=tzMatch?+tzMatch[1]:(kind==='nikki'?-7:8);

  // English: August 19, 2026 – September 9, 2026, 05:59
  let range=chunk.match(/([A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?(?:[^–—-]{0,80}))\s+[–—-]\s+([A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?(?:[^.]{0,100}))/i);
  // Russian: с 19 августа ... до 30 сентября 05:59
  if(!range)range=chunk.match(/(?:с\s+)?(\d{1,2}\s+[А-Яа-яёЁ]+(?:\s+\d{4})?(?:[^–—-]{0,100}))\s+(?:до|—|-)\s+(\d{1,2}\s+[А-Яа-яёЁ]+(?:\s+\d{4})?(?:[^.]{0,100}))/u);
  // Numeric server dates.
  if(!range)range=chunk.match(/(\d{4}\/\d{1,2}\/\d{1,2}(?:\s+\d{1,2}:\d{2})?)\s*(?:-|–|—)\s*(\d{4}\/\d{1,2}\/\d{1,2}(?:\s+\d{1,2}:\d{2})?)/);
  if(!range)return null;
  const years=(range[0].match(/\b20\d{2}\b/g)||[]);
  const year=years.length?+years[0]:yearNow;
  const start=parseDatePart(range[1],year,tz),end=parseDatePart(range[2],year,tz);
  if(!start||!end)return null;
  if(end<start)end.setUTCFullYear(end.getUTCFullYear()+1);
  return {start,end};
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
function localizeZZZDescription(title,desc){ const value=String(title??'').trim(); return zzzRussianDescriptions[value] || String(desc??''); }

function normalizeCalendarEvent(raw,game,index,source){
  const id=raw.id??raw.activity_id??raw.event_id??raw.ann_id??`${game}-${index}`;
  const rawTitle=raw.name??raw.title??raw.eventName??raw.activity_name;
  const title=game==='zzz'?localizeZZZTitle(rawTitle):rawTitle;
  const descRaw=raw.description??raw.desc??raw.summary??'';
  const desc=game==='zzz'?localizeZZZDescription(rawTitle,descRaw):descRaw;
  const startRaw=raw.start_time??raw.startTime??raw.start_at??raw.start;
  const endRaw=raw.end_time??raw.endTime??raw.end_at??raw.end;
  const start=typeof startRaw==='number'?new Date(startRaw*1000):new Date(startRaw);
  let end=typeof endRaw==='number'?new Date(endRaw*1000):new Date(endRaw);
  const challengeType=String(raw.challenge_type||raw.type_name||'').toLowerCase();
  const isZZZChallenge=game==='zzz' && zzzChallengeTypes.has(challengeType);
  if(isZZZChallenge && !Number.isNaN(end.getTime())) { /* shifted in normalizeZZZChallenge */ }
  if(!title||Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start)return null;
  return {id:`${source}:${game}:${id}`,game,title:String(title),desc:String(desc),start,end,done:false,source,url:raw.url||raw.link||'',category:isZZZChallenge?'mode':(raw.category||'event'),challenge_type:isZZZChallenge?challengeType:undefined};
}

const calendarSources={
  genshin:'https://api.ennead.cc/mihoyo/genshin/calendar?lang=ru-ru',
  hsr:'https://api.ennead.cc/mihoyo/starrail/calendar?lang=ru-ru',
  zzz:'https://api.ennead.cc/mihoyo/zenless/calendar?lang=ru-ru',
  wuwa:'https://gamecal.nv5.me/api/events?game=ww',
  endfield:'https://gamecal.nv5.me/api/events?game=endfield'
};

// ZZZ Europe: в этом трекере пользователь живёт в UTC+4.
// Ennead отдаёт ZZZ challenges с границами календарного дня,
// а фактический сброс этих режимов у пользователя происходит в 07:00.
const ZZZ_USER_RESET_OFFSET_MS=7*60*60*1000;

function normalizeZZZChallenge(raw){
  const type=String(raw?.type_name||'');
  if(type!=='deadly_assault' && type!=='shiyu_defense') return null;
  return {
    ...raw,
    title:raw.name,
    category:'mode',
    challenge_type:type,
    // API задаёт начало/конец календарного дня.
    // Сдвигаем обе границы на 7 часов, чтобы получить фактическое
    // время сброса ZZZ Europe в часовом поясе пользователя (UTC+4).
    start_time:typeof raw.start_time==='number' ? raw.start_time + 7*60*60 : raw.start_time,
    end_time:typeof raw.end_time==='number' ? raw.end_time + 7*60*60 : raw.end_time
  };
}

async function calendarEvents(game){
  const url=calendarSources[game];if(!url)throw new Error('unknown calendar source');
  return cached(`calendar:${game}`,async()=>{
    const data=await fetchJson(url);
    const events=Array.isArray(data)?data:(data?.events||data?.data?.events||[]);
    const challenges=game==='zzz' && Array.isArray(data?.challenges)
      ? data.challenges.map(normalizeZZZChallenge).filter(Boolean)
      : [];
    const list=[...events,...challenges];
    const now=Date.now();
    return list.map((x,i)=>normalizeCalendarEvent(x,game,i,'calendar')).filter(Boolean).filter(e=>e.end.getTime()>now);
  });
}


function extractOfficialEvents(text,game,baseUrl){
  const out=[];
  const now=Date.now();
  const compact=text.replace(/\s+/g,' ');
  const patterns=game==='nikki'
    ? [/\[([^\]]+)\][^\[]{0,500}?(?:Event Duration|Duration):\s*([^\[]+?)(?=\[|$)/gi]
    : game==='nte'
      ? [/(?:[●•]\s*)?(?:"|«)([^"»]+)(?:"|»)[^●•]{0,300}?(?:Duration|Длительность|Доступно):\s*([^●•]+?)(?=●|•|$)/gi]
      : [/(?:\[([^\]]+)\]|(?:Limited-Time Event|Event)\s+["“]([^"”]+)["”])[^.]{0,350}?(?:Event Time|Event Duration|Duration):\s*([^●•]+?)(?=\b(?:Event Time|Event Duration|Duration)\b|$)/gi];
  for(const re of patterns){
    let m;
    while((m=re.exec(compact))){
      let title=m[1]||m[2]||m[3]||'Событие';
      const durationText=m[2]||m[3]||m[4]||'';
      const fake=`Event Duration ${durationText}`;
      const duration=parseDuration(fake,game);
      if(!duration||duration.end.getTime()<=now)continue;
      out.push({id:`official:${game}:${Buffer.from(baseUrl+'#'+m.index).toString('base64url')}`,game,title:title.trim(),desc:'Официальное событие',start:duration.start,end:duration.end,done:false,source:'official',url:baseUrl});
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

function endfieldDateRange(text){
  const nowYear=new Date().getUTCFullYear();
  const tz=8;
  const clean=text.replace(/\s+/g,' ').replace(/[–—]/g,'-');
  // Explicit date range, e.g. Aug. 10, 2026 at 13:00 - Sept. 9, 2026 at 23:59 (UTC+8)
  let m=clean.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},\s*20\d{2}(?:\s+at\s+\d{1,2}(?::\d{2})?)?)[^0-9]{1,80}((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},\s*20\d{2}(?:\s+at\s+\d{1,2}(?::\d{2})?)?)/i);
  if(m){
    const start=parseDatePart(m[1].replace(/\bat\b/gi,' '),nowYear,tz);
    const end=parseDatePart(m[2].replace(/\bat\b/gi,' '),nowYear,tz);
    if(start&&end)return {start,end};
  }
  // Start/end with the same month/year omitted on the end side.
  m=clean.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},\s*20\d{2}(?:\s+at\s+\d{1,2}(?::\d{2})?)?)[^0-9]{1,80}((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}(?:,\s*20\d{2})?(?:\s+at\s+\d{1,2}(?::\d{2})?)?)/i);
  if(m){
    const start=parseDatePart(m[1].replace(/\bat\b/gi,' '),nowYear,tz);
    const end=parseDatePart(m[2].replace(/\bat\b/gi,' '),nowYear,tz);
    if(start&&end)return {start,end};
  }
  return null;
}

function endfieldRelativeRange(raw){
  const clean=raw.replace(/\s+/g,' ').replace(/[–—]/g,' - ');
  const patchStart=new Date(Date.UTC(2026,6,30,11,59)-8*3600000);
  const patchEnd=new Date(Date.UTC(2026,7,30,11,59)-8*3600000);
  const endMatch=clean.match(/(?:-|to)\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},\s*20\d{2}(?:\s+at\s+\d{1,2}(?::\d{2})?)?)/i);
  const beforeUpdate=/before version update and maintenance/i.test(clean);
  const start=patchStart;
  if(beforeUpdate)return {start,end:patchEnd};
  if(endMatch){
    const end=parseDatePart(endMatch[1].replace(/\bat\b/gi,' '),2026,8);
    if(end)return {start,end};
  }
  // Some official entries use a single date after the version-update marker.
  const single=clean.match(/(?:after .*?version update\s*-\s*)?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},\s*20\d{2}(?:\s+at\s+\d{1,2}(?::\d{2})?)?)/i);
  if(single){
    const end=parseDatePart(single[1].replace(/\bat\b/gi,' '),2026,8);
    if(end)return {start,end};
  }
  return null;
}

function extractEndfieldEvents(text,baseUrl){
  const now=Date.now();
  const compact=text.replace(/\s+/g,' ').replace(/[–—]/g,' - ');
  const out=[];
  // Official Homecoming version notes contain a "New Events" section with numbered entries.
  const sectionMatch=compact.match(/(?:New Events|New Event)[\s:]*([\s\S]*?)(?=Event & Gameplay Updates|Event & Gameplay Update|$)/i);
  const section=sectionMatch?sectionMatch[1]:compact;
  const re=/(?:^|\s)(?:\d+\.\s*)?(?:\[([^\]]+)\]|["“]([^"”]+)["”])([^]{0,500}?)(?=\s+(?:\d+\.\s*)?(?:\[|["“])|$)/gi;
  let m;
  while((m=re.exec(section))){
    const title=(m[1]||m[2]||'').trim();
    const body=m[3]||'';
    if(!title)continue;
    const tm=body.match(/Event Time\s*:\s*([^•]+?)(?=\s+·|\s+Event Details|\s+\d+\.|$)/i);
    if(!tm)continue;
    let range=endfieldDateRange(tm[1]);
    // "After [Homecoming] version update - Aug. 9 ..." starts relatively.
    if(!range){
      const explicit=tm[1].match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},?\s*20\d{2}?[^-]{0,40})\s*-\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},?\s*20\d{2}?[^.]*)/i);
      if(explicit)range=endfieldDateRange(explicit[0]);
    }
    if(!range)range=endfieldRelativeRange(tm[1]);
    if(!range)continue;
    if(range.end.getTime()<=now)continue;
    out.push({id:`official:endfield:${Buffer.from(baseUrl+'#'+m.index).toString('base64url')}`,game:'endfield',title,desc:body.replace(/Event Time\s*:[\s\S]*$/i,'').trim().slice(0,500),start:range.start,end:range.end,done:false,source:'official',url:baseUrl});
  }
  return out;
}

async function scrapeOfficial(game){
  const cfg={
    nte:{index:'https://nte.perfectworld.com/ru/article/news/gamenews/index.html',match:'/article/news/gamenews/',fallback:'https://nte.perfectworld.com/ru/article/news/gamenews/20260817/263612.html'},
    nikki:{index:'https://infinitynikki.infoldgames.com/en/news',match:'/en/news/',fallback:'https://infinitynikki.infoldgames.com/en/news/568'},
    endfield:{index:'https://endfield.gryphline.com/en-us/news',match:'/en-us/news/',fallback:ENDFIELD_OFFICIAL_SOURCES[0]}
  }[game];
  const now=Date.now();
  let links=[];
  try{
    const html=await requestText(cfg.index);
    links=linksFrom(html,cfg.index).filter(x=>x.url.includes(cfg.match));
  }catch(err){
    console.warn(game,'index unavailable:',err.message);
  }
  const unique=[...new Map(links.map(x=>[x.url,x])).values()];
  if(game==='endfield'){
    for(const url of ENDFIELD_OFFICIAL_SOURCES){
      if(!unique.some(x=>x.url===url)) unique.unshift({url,title:''});
    }
  } else if(cfg.fallback&&!unique.some(x=>x.url===cfg.fallback)) unique.unshift({url:cfg.fallback,title:''});
  // Не опрашиваем десятки страниц последовательно: это и вызывало минутное ожидание.
  const selected=unique.slice(0,10);
  const results=await Promise.all(selected.map(async link=>{
    try{
      const article=await requestText(link.url);
      const text=cleanText(article);
      const extracted=game==='endfield'
        ? extractEndfieldEvents(text,link.url)
        : extractOfficialEvents(text,game,link.url);
      if(extracted.length) return extracted;
      const duration=parseDuration(text,game);
      if(!duration||duration.end.getTime()<=now) return [];
      const title=firstTitle(article,link.title||'Событие');
      return [{id:`official:${game}:${Buffer.from(link.url).toString('base64url')}`,game,title,desc:'Официальное событие',start:duration.start,end:duration.end,done:false,source:'official',url:link.url}];
    }catch(err){
      console.warn(game,link.url,err.message);
      return [];
    }
  }));
  const events=results.flat();
  return [...new Map(events.map(e=>[`${e.title}|${e.end.toISOString()}`,e])).values()];
}

async function officialEvents(game){return scrapeOfficial(game)}

function sendJson(res,status,data){const body=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});res.end(body)}
function serveFile(req,res){
  let pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/'||pathname==='/index.html')pathname='/index.html';
  const file=path.normalize(path.join(ROOT,pathname));
  if(!file.startsWith(ROOT)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Not found');}
  const ext=path.extname(file);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.md':'text/plain; charset=utf-8'};
  res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}

const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://localhost');
    if(u.pathname==='/api/events'){
      const game=u.searchParams.get('game');
      if(!calendarSources[game])return sendJson(res,400,{ok:false,error:'unknown game'});
      const events=await calendarEvents(game);
      return sendJson(res,200,{ok:true,game,source:calendarSources[game],updatedAt:new Date().toISOString(),events});
    }
    if(u.pathname==='/api/official-events'){
      const game=u.searchParams.get('game');
      if(!['nte','nikki','endfield'].includes(game))return sendJson(res,400,{ok:false,error:'unknown official game'});
      const events=await officialEvents(game);
      return sendJson(res,200,{ok:true,game,updatedAt:new Date().toISOString(),events});
    }
    if(u.pathname==='/api/health')return sendJson(res,200,{ok:true,time:new Date().toISOString(),sources:['genshin','hsr','zzz','wuwa','endfield','nte','nikki']});
    serveFile(req,res);
  }catch(e){console.error(e);sendJson(res,500,{ok:false,error:e.message});}
});
server.listen(PORT,()=>console.log(`EVENTCLOCK server: http://localhost:${PORT}`));
