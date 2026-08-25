const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map();

async function requestText(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 EVENTCLOCK/1.2',
      'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8'
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
function cleanText(html) { return decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')); }
function firstTitle(html, fallback) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(m[1]).replace(/\s*[|-]\s*(NTE|Infinity Nikki|Arknights:? Endfield).*$/i, '').trim() : fallback;
}
function eventId(base, index) { return encodeURIComponent(`${base}#${index}`); }

const enMonths = { january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11 };
const ruMonths = { января:0,февраля:1,марта:2,апреля:3,мая:4,июня:5,июля:6,августа:7,сентября:8,октября:9,ноября:10,декабря:11 };
function parseDatePart(s, yearHint, tzHours) {
  s = s.trim().replace(/[–—]/g,'-').replace(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\./gi,'$1').replace(/\s+/g,' ');
  let m = s.match(/([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?(?:[^0-9]{0,20}(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
  if (m) {
    const month=enMonths[m[1].toLowerCase()];
    if(month!==undefined){ const day=+m[2],year=m[3]?+m[3]:yearHint; let hour=m[4]!==undefined?+m[4]:0,minute=m[5]?+m[5]:0;
      if(m[6]){const ap=m[6].toUpperCase();if(ap==='PM'&&hour<12)hour+=12;if(ap==='AM'&&hour===12)hour=0;}
      return new Date(Date.UTC(year,month,day,hour,minute)-tzHours*3600000); }
  }
  m=s.match(/(\d{1,2})\s+([А-Яа-яёЁ]+)(?:\s+(\d{4}))?(?:[^0-9]{0,20}(\d{1,2})(?::(\d{2}))?)?/u);
  if(m){ const month=ruMonths[m[2].toLowerCase()]; if(month!==undefined){ const day=+m[1],year=m[3]?+m[3]:yearHint,hour=m[4]?+m[4]:0,minute=m[5]?+m[5]:0; return new Date(Date.UTC(year,month,day,hour,minute)-tzHours*3600000); } }
  m=s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if(m)return new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0))-tzHours*3600000);
  return null;
}
function parseDuration(text,kind){
  const marker=kind==='nte'?'(?:Duration|Длительность|Расписание события|Доступно)':'(?:Event Duration|Event Time|Duration|Event Time|Длительность)';
  const idx=text.search(new RegExp(marker,'i')); if(idx<0)return null;
  const chunk=text.slice(idx,idx+1200).replace(/\s+/g,' '); const yearNow=new Date().getUTCFullYear();
  const tzMatch=chunk.match(/UTC\s*([+-]\d{1,2})(?::(\d{2}))?/i); const tz=tzMatch?+tzMatch[1]:(kind==='nikki'?-7:8);
  let range=chunk.match(/([A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?(?:[^–—-]{0,80}))\s+[–—-]\s+([A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?(?:[^.]{0,100}))/i);
  if(!range)range=chunk.match(/(?:с\s+)?(\d{1,2}\s+[А-Яа-яёЁ]+(?:\s+\d{4})?(?:[^–—-]{0,100}))\s+(?:до|—|-)\s+(\d{1,2}\s+[А-Яа-яёЁ]+(?:\s+\d{4})?(?:[^.]{0,100}))/u);
  if(!range)range=chunk.match(/(\d{4}\/\d{1,2}\/\d{1,2}(?:\s+\d{1,2}:\d{2})?)\s*(?:-|–|—)\s*(\d{4}\/\d{1,2}\/\d{1,2}(?:\s+\d{1,2}:\d{2})?)/);
  if(!range)return null; const years=(range[0].match(/\b20\d{2}\b/g)||[]); const year=years.length?+years[0]:yearNow;
  const start=parseDatePart(range[1],year,tz),end=parseDatePart(range[2],year,tz); if(!start||!end)return null; if(end<start)end.setUTCFullYear(end.getUTCFullYear()+1); return {start,end};
}
function normalizeCalendarEvent(raw,game,index,source){
  const id=raw.id??raw.activity_id??raw.event_id??raw.ann_id??`${game}-${index}`; const title=raw.name??raw.title??raw.eventName??raw.activity_name;
  const desc=raw.description??raw.desc??raw.summary??''; const startRaw=raw.start_time??raw.startTime??raw.start_at??raw.start; const endRaw=raw.end_time??raw.endTime??raw.end_at??raw.end;
  const start=typeof startRaw==='number'?new Date(startRaw*1000):new Date(startRaw); const end=typeof endRaw==='number'?new Date(endRaw*1000):new Date(endRaw);
  if(!title||Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start)return null;
  return {id:`${source}:${game}:${id}`,game,title:String(title),desc:String(desc),start,end,done:false,source};
}
const calendarSources={genshin:'https://api.ennead.cc/mihoyo/genshin/calendar?lang=ru-ru',hsr:'https://api.ennead.cc/mihoyo/starrail/calendar?lang=ru-ru',zzz:'https://api.ennead.cc/mihoyo/zenless/calendar?lang=ru-ru',wuwa:'https://gamecal.nv5.me/api/events?game=ww',endfield:'https://gamecal.nv5.me/api/events?game=endfield'};
async function calendarEvents(game){
  const url=calendarSources[game]; if(!url)throw new Error('unknown game');
  return cached(`calendar:${game}`,async()=>{ const data=await fetchJson(url); const list=Array.isArray(data)?data:(data?.events||data?.data?.events||[]); const now=Date.now(); return list.map((x,i)=>normalizeCalendarEvent(x,game,i,'calendar')).filter(Boolean).filter(e=>e.end.getTime()>now); });
}
function extractOfficialEvents(text,game,baseUrl){
  const out=[],now=Date.now(),compact=text.replace(/\s+/g,' ');
  const patterns=game==='nikki' ? [/\[([^\]]+)\][^\[]{0,500}?(?:Event Duration|Duration):\s*([^\[]+?)(?=\[|$)/gi] : game==='nte' ? [/(?:[●•]\s*)?(?:"|«)([^"»]+)(?:"|»)[^●•]{0,300}?(?:Duration|Длительность|Доступно):\s*([^●•]+?)(?=●|•|$)/gi] : [/(?:\[([^\]]+)\]|(?:Limited-Time Event|Event)\s+["“]([^"”]+)["”])[^.]{0,350}?(?:Event Time|Event Duration|Duration):\s*([^●•]+?)(?=\b(?:Event Time|Event Duration|Duration)\b|$)/gi];
  for(const re of patterns){let m;while((m=re.exec(compact))){const title=m[1]||m[2]||m[3]||'Событие';const durationText=m[2]||m[3]||m[4]||'';const duration=parseDuration(`Event Duration ${durationText}`,game);if(!duration||duration.end.getTime()<=now)continue;out.push({id:`official:${game}:${eventId(baseUrl,m.index)}`,game,title:title.trim(),desc:'Официальное событие',start:duration.start,end:duration.end,done:false,source:'official',url:baseUrl});}}
  return out;
}
const ENDFIELD_OFFICIAL_SOURCES=['https://endfield.gryphline.com/en-us/news/5200','https://endfield.gryphline.com/en-us/news/4482','https://endfield.gryphline.com/en-us/news/1329','https://endfield.gryphline.com/en-us/news/3831'];
function endfieldDateRange(text){
  const nowYear=new Date().getUTCFullYear(),tz=8,clean=text.replace(/\s+/g,' ').replace(/[–—]/g,'-');
  let m=clean.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},\s*20\d{2}(?:\s+at\s+\d{1,2}(?::\d{2})?)?)[^0-9]{1,80}((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},\s*20\d{2}(?:\s+at\s+\d{1,2}(?::\d{2})?)?)/i);
  if(m){const start=parseDatePart(m[1].replace(/\bat\b/gi,' '),nowYear,tz),end=parseDatePart(m[2].replace(/\bat\b/gi,' '),nowYear,tz);if(start&&end)return{start,end};}
  m=clean.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},\s*20\d{2}(?:\s+at\s+\d{1,2}(?::\d{2})?)?)[^0-9]{1,80}((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}(?:,\s*20\d{2})?(?:\s+at\s+\d{1,2}(?::\d{2})?)?)/i);
  if(m){const start=parseDatePart(m[1].replace(/\bat\b/gi,' '),nowYear,tz),end=parseDatePart(m[2].replace(/\bat\b/gi,' '),nowYear,tz);if(start&&end)return{start,end};} return null;
}
function endfieldRelativeRange(raw){
  const clean=raw.replace(/\s+/g,' ').replace(/[–—]/g,' - '); const patchStart=new Date(Date.UTC(2026,6,30,11,59)-8*3600000); const patchEnd=new Date(Date.UTC(2026,7,30,11,59)-8*3600000);
  const endMatch=clean.match(/(?:-|to)\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},\s*20\d{2}(?:\s+at\s+\d{1,2}(?::\d{2})?)?)/i); const beforeUpdate=/before version update and maintenance/i.test(clean); const start=patchStart;
  if(beforeUpdate)return{start,end:patchEnd}; if(endMatch){const end=parseDatePart(endMatch[1].replace(/\bat\b/gi,' '),2026,8);if(end)return{start,end};}
  const single=clean.match(/(?:after .*?version update\s*-\s*)?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},\s*20\d{2}(?:\s+at\s+\d{1,2}(?::\d{2})?)?)/i); if(single){const end=parseDatePart(single[1].replace(/\bat\b/gi,' '),2026,8);if(end)return{start,end};} return null;
}
function extractEndfieldEvents(text,baseUrl){
  const now=Date.now(),compact=text.replace(/\s+/g,' ').replace(/[–—]/g,' - '),out=[]; const sectionMatch=compact.match(/(?:New Events|New Event)[\s:]*([\s\S]*?)(?=Event & Gameplay Updates|Event & Gameplay Update|$)/i); const section=sectionMatch?sectionMatch[1]:compact;
  const re=/(?:^|\s)(?:\d+\.\s*)?(?:\[([^\]]+)\]|["“]([^"”]+)["”])([^]{0,500}?)(?=\s+(?:\d+\.\s*)?(?:\[|["“])|$)/gi; let m;
  while((m=re.exec(section))){const title=(m[1]||m[2]||'').trim(),body=m[3]||'';if(!title)continue;const tm=body.match(/Event Time\s*:\s*([^•]+?)(?=\s+·|\s+Event Details|\s+\d+\.|$)/i);if(!tm)continue;let range=endfieldDateRange(tm[1]);if(!range){const explicit=tm[1].match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},?\s*20\d{2}?[^-]{0,40})\s*-\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},?\s*20\d{2}?[^.]*)/i);if(explicit)range=endfieldDateRange(explicit[0]);}if(!range)range=endfieldRelativeRange(tm[1]);if(!range||range.end.getTime()<=now)continue;out.push({id:`official:endfield:${eventId(baseUrl,m.index)}`,game:'endfield',title,desc:body.replace(/Event Time\s*:[\s\S]*$/i,'').trim().slice(0,500),start:range.start,end:range.end,done:false,source:'official',url:baseUrl});}
  return out;
}
async function scrapeOfficial(game){
  const cfg={nte:{index:'https://nte.perfectworld.com/ru/article/news/gamenews/index.html',match:'/article/news/gamenews/',fallback:'https://nte.perfectworld.com/ru/article/news/gamenews/20260817/263612.html'},nikki:{index:'https://infinitynikki.infoldgames.com/en/news',match:'/en/news/',fallback:'https://infinitynikki.infoldgames.com/en/news/568'},endfield:{index:'https://endfield.gryphline.com/en-us/news',match:'/en-us/news/',fallback:ENDFIELD_OFFICIAL_SOURCES[0]}}[game];
  const now=Date.now();let links=[];try{const html=await requestText(cfg.index);links=linksFrom(html,cfg.index).filter(x=>x.url.includes(cfg.match));}catch(err){console.warn(game,'index unavailable:',err.message);}
  const unique=[...new Map(links.map(x=>[x.url,x])).values()]; if(game==='endfield'){for(const url of ENDFIELD_OFFICIAL_SOURCES){if(!unique.some(x=>x.url===url))unique.unshift({url,title:''});}}else if(cfg.fallback&&!unique.some(x=>x.url===cfg.fallback))unique.unshift({url:cfg.fallback,title:''});
  const selected=unique.slice(0,10); const results=await Promise.all(selected.map(async link=>{try{const article=await requestText(link.url);const text=cleanText(article);const extracted=game==='endfield'?extractEndfieldEvents(text,link.url):extractOfficialEvents(text,game,link.url);if(extracted.length)return extracted;const duration=parseDuration(text,game);if(!duration||duration.end.getTime()<=now)return[];const title=firstTitle(article,link.title||'Событие');return[{id:`official:${game}:${eventId(link.url,0)}`,game,title,desc:'Официальное событие',start:duration.start,end:duration.end,done:false,source:'official',url:link.url}];}catch(err){console.warn(game,link.url,err.message);return[];}}));
  const events=results.flat();return[...new Map(events.map(e=>[`${e.title}|${e.end.toISOString()}`,e])).values()];
}
async function officialEvents(game){return scrapeOfficial(game);}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});}

export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    try {
      if (u.pathname === '/api/events') {
        const game = u.searchParams.get('game');
        if (!calendarSources[game]) return json({ok:false,error:'unknown game'},400);
        const events = await calendarEvents(game);
        return json({ok:true,game,source:calendarSources[game],updatedAt:new Date().toISOString(),events});
      }
      if (u.pathname === '/api/official-events') {
        const game = u.searchParams.get('game');
        if (!['nte','nikki','endfield'].includes(game)) return json({ok:false,error:'unknown official game'},400);
        const events = await officialEvents(game);
        return json({ok:true,game,updatedAt:new Date().toISOString(),events});
      }
      if (u.pathname === '/api/health') return json({ok:true,time:new Date().toISOString(),sources:['genshin','hsr','zzz','wuwa','endfield','nte','nikki']});
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(e);
      return json({ok:false,error:e?.message||String(e)},500);
    }
  }
};
