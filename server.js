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

function normalizeCalendarEvent(raw,game,index,source){
  const id=raw.id??raw.activity_id??raw.event_id??raw.ann_id??`${game}-${index}`;
  const title=raw.name??raw.title??raw.eventName??raw.activity_name;
  const desc=raw.description??raw.desc??raw.summary??'';
  const startRaw=raw.start_time??raw.startTime??raw.start_at??raw.start;
  const endRaw=raw.end_time??raw.endTime??raw.end_at??raw.end;
  const start=typeof startRaw==='number'?new Date(startRaw*1000):new Date(startRaw);
  const end=typeof endRaw==='number'?new Date(endRaw*1000):new Date(endRaw);
  if(!title||Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start)return null;
  return {id:`${source}:${game}:${id}`,game,title:String(title),desc:String(desc),start,end,done:false,source,url:raw.url||raw.link||''};
}

const calendarSources={
  genshin:'https://api.ennead.cc/mihoyo/genshin/calendar?lang=ru-ru',
  hsr:'https://api.ennead.cc/mihoyo/starrail/calendar?lang=ru-ru',
  zzz:'https://api.ennead.cc/mihoyo/zenless/calendar?lang=ru-ru',
  wuwa:'https://gamecal.nv5.me/api/events?game=ww',
  endfield:'https://web-news.gryphline.com/api/bulletin?lang=ru-ru&code=arknights_endfield_official&page=1&pageSize=100'
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


const ENDFIELD_BULLETIN_URL='https://web-news.gryphline.com/api/bulletin?lang=ru-ru&code=arknights_endfield_official&page=1&pageSize=100';
const ENDFIELD_SITE='https://endfield.gryphline.com/ru-ru';

// These are official Russian pages which define the current/previous version calendar.
// The bulletin is used to discover newer articles automatically.
const ENDFIELD_OFFICIAL_SOURCES=[
  'https://endfield.gryphline.com/ru-ru/news/5200',
  'https://endfield.gryphline.com/ru-ru/news/3831',
  'https://endfield.gryphline.com/ru-ru/news/9564'
];

async function endfieldOfficialArticles(){
  return cached('endfield:bulletin:ru', async()=>{
    const data=await fetchJson(ENDFIELD_BULLETIN_URL);
    const list=Array.isArray(data?.data?.list)?data.data.list:[];
    return list.filter(x=>{
      const t=String(x?.title||'');
      const tab=String(x?.tab||'');
      return tab==='events' ||
        /поставка|специальн(?:ый|ого)\s+наем|сведени[яе]\s+о\s+(?:временном|сюжетном|событии|веб-событии)|описание\s+обновления\s+версии|обновление.*версии/i.test(t);
    }).map(x=>({
      cid:String(x.cid), title:String(x.title||''), brief:String(x.brief||''),
      tab:String(x.tab||''), url:`${ENDFIELD_SITE}/news/${String(x.cid).replace(/^0+/,'')}`
    }));
  });
}

function endfieldNextVersionMaintenance(){
  // Temporary fallback for the current 1.4 calendar. The official 1.5 update is
  // scheduled for 2 September 2026; once the official update notice appears,
  // the parser below will prefer its explicit maintenance window.
  return new Date(Date.UTC(2026,8,1,22,0,0)); // 02 Sep 2026 01:00 MSK
}

function endfieldDatePartRu(s, fallbackYear=2026){
  const clean=String(s||'').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
  const m=clean.match(/(\d{1,2})\s+([А-Яа-яёЁ]+)(?:\s+(\d{4})\s*(?:г\.?)?)?(?:\s*,?\s*(\d{1,2}):(\d{2}))?/u);
  if(!m)return null;
  const month=ruMonths[m[2].toLowerCase()];
  if(month===undefined)return null;
  return new Date(Date.UTC(+(m[3]||fallbackYear),month,+m[1],+(m[4]||0),+(m[5]||0))-3*3600000);
}

// Parses the actual Russian wording used by the official Endfield announcements.
// The important distinction is that Americas/Europe times in the RU community
// are given in MSK, so 3 hours are subtracted when converting to UTC.
function parseEndfieldRussianDuration(text){
  const clean=String(text||'').replace(/\s+/g,' ').replace(/[–—]/g,' - ');
  const nowYear=new Date().getUTCFullYear();

  // 1) Explicit Americas/Europe range.
  let m=clean.match(/(?:Сервер\s+)?Americas\s*\/\s*Europe\s*:\s*(?:с\s*)?(\d{1,2}\s+[А-Яа-яёЁ]+\s+20\d{2}\s*,?\s*\d{1,2}:\d{2})\s*(?:до|-)\s*(\d{1,2}\s+[А-Яа-яёЁ]+\s+20\d{2}\s*,?\s*\d{1,2}:\d{2})/iu);
  if(m){
    const start=endfieldDatePartRu(m[1],nowYear), end=endfieldDatePartRu(m[2],nowYear);
    if(start&&end){if(end<start)end.setUTCFullYear(end.getUTCFullYear()+1);return {start,end};}
  }

  // 2) "from X at ... (Americas/Europe) until version update/maintenance".
  m=clean.match(/(?:с\s*)?(\d{1,2}\s+[А-Яа-яёЁ]+\s+20\d{2})[^.]{0,180}?(?:Americas\s*\/\s*Europe|Сервер\s+Americas\s*\/\s*Europe)[^.]{0,100}?(?:до|—|-)\s*(?:начала\s+)?технических\s+работ|до\s+обновления\s+версии(?:\s+и\s+технического\s+обслуживания)?/iu);
  if(m){
    const start=endfieldDatePartRu(m[1],nowYear), end=endfieldNextVersionMaintenance();
    if(start&&end&&end>start)return {start,end};
  }

  // 3) Common Russian range with explicit times. Treat it as MSK.
  m=clean.match(/(?:с\s*)?(\d{1,2}\s+[А-Яа-яёЁ]+\s+20\d{2}\s*,?\s*\d{1,2}:\d{2})\s*(?:до|-)\s*(\d{1,2}\s+[А-Яа-яёЁ]+\s+20\d{2}\s*,?\s*\d{1,2}:\d{2})/iu);
  if(m){
    const start=endfieldDatePartRu(m[1],nowYear), end=endfieldDatePartRu(m[2],nowYear);
    if(start&&end){if(end<start)end.setUTCFullYear(end.getUTCFullYear()+1);return {start,end};}
  }

  // 4) Same-day start + "до начала технических работ".
  m=clean.match(/(?:с\s*)?(\d{1,2}\s+[А-Яа-яёЁ]+\s+20\d{2}\s*,?\s*\d{1,2}:\d{2})[^.]{0,160}?до\s+начала\s+технических\s+работ/iu);
  if(m){
    const start=endfieldDatePartRu(m[1],nowYear), end=endfieldNextVersionMaintenance();
    if(start&&end&&end>start)return {start,end};
  }
  return null;
}

function endfieldExtractRussianArticleEvents(text, url, fallbackTitle=''){
  const clean=String(text||'').replace(/\r/g,' ').replace(/\s+/g,' ').trim();
  const out=[];
  const now=Date.now();

  // Split numbered "New Events" sections. This is deliberately based on the
  // official article structure rather than machine translation.
  const sectionMatch=clean.match(/(?:■\s*)?(?:Новые события|События и игровой процесс|Новые события найма и поставки)([\s\S]*?)(?:■\s*(?:Обновления событий|Обновление событий|АПК|Система|Другое)|$)/i);
  const section=sectionMatch?sectionMatch[1]:clean;
  const re=/(?:^|\s)(\d+)\.\s*([^·]{2,180}?)(?=\s*·\s*(?:Время|Расписание|Доступность|Период)|\s+\d+\.\s)/gi;
  let m;
  while((m=re.exec(section))){
    const title=m[2].replace(/\s+/g,' ').trim().replace(/^[-–—:]+|[-–—:]+$/g,'');
    const body=section.slice(m.index,m.index+1600);
    const duration=parseEndfieldRussianDuration(body);
    if(!duration||duration.end.getTime()<=now)continue;
    out.push({id:`official:endfield:${eventId(url,m.index)}`,game:'endfield',title,desc:'Официальное событие',start:duration.start,end:duration.end,done:false,source:'official',url});
  }
  return out;
}

// Current calendar fallback, based on official Russian announcements. It is
// only used when the official page is client-rendered or temporarily unavailable.
// The worker still refreshes the bulletin every 5 minutes, so newer official
// announcements can replace these entries.
function endfieldCurrentCalendarFallback(){
  const end=endfieldNextVersionMaintenance();
  const mk=(id,title,start,desc='')=>({id:`official:endfield:fallback:${id}`,game:'endfield',title,desc,start:new Date(start),end,done:false,source:'official',url:`${ENDFIELD_SITE}#calendar`});
  return [
    mk('liino','Приветствие утренней звезды','2026-08-09T17:00:00.000Z','Специальный наем'),
    mk('bedazzled','Ослепление','2026-08-09T17:00:00.000Z','Поставка арсенала'),
    mk('forest','Лес, укрытый снегом','2026-08-26T17:00:00.000Z','Временное событие входа'),
    mk('rooted','Царство корней','2026-08-09T17:00:00.000Z','Развлекательное событие'),

    // Игровые режимы из официального календаря Endfield.
    // Они идут отдельной категорией `mode`, поэтому появляются во вкладке
    // «Временные режимы», как Бездна/Зал Забвения в других играх.
    {id:'official:endfield:mode:war-echo',game:'endfield',title:'Эхо войны',desc:'Постоянный режим испытаний',start:new Date('2026-07-16T17:00:00.000Z'),end:new Date(end),done:false,source:'official',category:'mode',url:`${ENDFIELD_SITE}#calendar`},
    {id:'official:endfield:mode:memories-season',game:'endfield',title:'Сезон воспоминаний',desc:'Сезон режима «Эхо войны»',start:new Date('2026-07-16T17:00:00.000Z'),end:new Date('2026-08-09T17:00:00.000Z'),done:false,source:'official',category:'mode',url:`${ENDFIELD_SITE}#calendar`},
    {id:'official:endfield:mode:madness-season',game:'endfield',title:'Сезон помешательства',desc:'Текущий сезон режима «Эхо войны»',start:new Date('2026-08-09T17:00:00.000Z'),end:new Date(end),done:false,source:'official',category:'mode',url:`${ENDFIELD_SITE}#calendar`},
    {id:'official:endfield:mode:dimensional-abode',game:'endfield',title:'Обитель шести искусных измерений',desc:'Скопление разломов «Исследование загадок». Доступно бессрочно после открытия.',start:new Date('2026-08-26T09:00:00.000Z'),end:new Date(end),done:false,source:'official',category:'mode',url:`${ENDFIELD_SITE}#calendar`},
    {id:'official:endfield:mode:shadow-monument',game:'endfield',title:'Сумрачный монумент',desc:'Постоянный режим испытаний. Серия «Ревуны скал» доступна с 6 августа.',start:new Date('2026-08-06T17:00:00.000Z'),end:new Date(end),done:false,source:'official',category:'mode',url:`${ENDFIELD_SITE}#calendar`},
    {id:'official:endfield:mode:memory-marks',game:'endfield',title:'Памятные знаки: Звериный вой',desc:'Временное событие, связанное с серией «Ревуны скал».',start:new Date('2026-08-06T17:00:00.000Z'),end:new Date('2026-08-20T09:00:00.000Z'),done:false,source:'official',category:'mode',url:`${ENDFIELD_SITE}#calendar`},

    {id:'official:endfield:fallback:sanity',game:'endfield',title:'Поставка рассудка',desc:'Временное событие',start:new Date('2026-08-26T09:00:00.000Z'),end:new Date('2026-09-01T22:00:00.000Z'),done:false,source:'official',url:`${ENDFIELD_SITE}#calendar`}
  ].filter(e=>e.end>Date.now());
}

async function endfieldOfficialCalendarEvents(){
  return cached('calendar:endfield:official-ru',async()=>{
    try{
      const articles=await endfieldOfficialArticles();
      const results=[];
      for(const a of articles.slice(0,60)){
        try{
          const ruUrl=a.url;
          const ruText=cleanText(await requestText(ruUrl));
          let extracted=endfieldExtractRussianArticleEvents(ruText,ruUrl,a.title);
          if(extracted.length) results.push(...extracted);

          // A few official RU pages are client-rendered. The EN page is used only
          // to recover timing; names are never machine-translated.
          if(!extracted.length || ruText.length<500){
            const enUrl=`https://endfield.gryphline.com/en-us/news/${String(a.cid).replace(/^0+/,'')}`;
            const enText=cleanText(await requestText(enUrl));
            const enExtract=extractEndfieldEvents(enText,enUrl);
            for(const e of enExtract){
              const title=(a.title||fallbackTitle).replace(/^Сведения о\s+/i,'').trim();
              results.push({...e,title:title||e.title,source:'official',url:ruUrl});
            }
          }
          const articleDuration=parseEndfieldRussianDuration(ruText);
          if(!extracted.length && articleDuration && articleDuration.end>Date.now()){
            const title=(a.title||'Событие').replace(/^Сведения о\s+/i,'').replace(/^Описание обновления версии\s*/i,'').trim();
            if(/поставка|наем|событи|испытан|режим|рассуд|лес|царств|протокол/i.test(title+' '+a.brief)){
              results.push({id:`official:endfield:${a.cid}`,game:'endfield',title,desc:a.brief,start:articleDuration.start,end:articleDuration.end,done:false,source:'official',url:ruUrl});
            }
          }
        }catch(err){}
      }

      // Merge the official current calendar fallback only for gaps.
      const all=[...results,...endfieldCurrentCalendarFallback()];
      const unique=[...new Map(all.map(e=>[`${e.title}|${e.start.toISOString()}|${e.end.toISOString()}`,e])).values()];
      return unique.filter(e=>e.end>Date.now());
    }catch(err){
      console.warn('endfield official calendar',err.message);
      return endfieldCurrentCalendarFallback();
    }
  });
}



async function calendarEvents(game){
  if(game==='endfield') return endfieldOfficialCalendarEvents();
  const url=calendarSources[game]; if(!url) return [];
  return cached(`calendar:${game}`,async()=>{
    try{
      const data=await fetchJson(url);
      const events=Array.isArray(data)?data:(data?.events||data?.data?.events||[]);
      const challenges=game==='zzz' && Array.isArray(data?.challenges)
        ? data.challenges.map(x=>({...x,title:x.name,challenge_type:x.type_name,category:'mode'}))
        : [];
      const list=[...events,...challenges], now=Date.now();
      return list.map((x,k)=>normalizeCalendarEvent(x,game,k,'calendar')).filter(Boolean).filter(e=>e.end.getTime()>now);
    }catch(err){console.warn('calendar',game,err.message);return[];}
  });
}


async function officialEvents(game){if(game==='endfield')return endfieldOfficialCalendarEvents().catch(()=>[]);return scrapeOfficial(game)}

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
