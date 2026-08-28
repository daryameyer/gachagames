const now = new Date();

const games = {
  all:{name:'Все', color:'#c6cbd6'},
  ended:{name:'Завершённые', color:'#6e7890'},
  genshin:{name:'Геншин', color:'#3ca9e5'},
  hsr:{name:'ХСР', color:'#6a2ab4'},
  nikki:{name:'Инфинити Никки', short:'Никки', color:'#dc5a98'},
  nte:{name:'НТЕ', color:'#62d6e6'},
  endfield:{name:'Arknights: Endfield', short:'Эндфилд', color:'#d8a84e'},
  wuwa:{name:'Вува', color:'#00040a'},
  zzz:{name:'ZZZ', color:'#e39a26'}
};

const day = 24*60*60*1000;

// Часовой пояс пользователя: МСК+1 = UTC+4.
const USER_UTC_OFFSET = 4;

function d(offsetDays, hour=12){
  const x=new Date(now.getTime()+offsetDays*day);
  x.setHours(hour,0,0,0);
  return x;
}

// Актуальные версии патчей.
// Время окончания указано в часовом поясе сервера UTC+8.
function serverDate(y,m,d,h,min){
  return new Date(Date.UTC(y,m-1,d,h-8,min,0));
}

const patches = [
  {game:'genshin', version:'7.0', title:'Вечная зима без милосердия', titleRu:'Вечная зима без милосердия', start:serverDate(2026,8,13,6,0), end:serverDate(2026,9,23,5,59)},
  {game:'hsr', version:'4.4', title:'In Ravages Does the Whistle Sound', titleRu:'В свете разрушений звучит свисток', start:serverDate(2026,7,15,6,0), end:serverDate(2026,8,26,6,0)},
  {game:'zzz', version:'3.1', title:'The Long Goodbye', titleRu:'Долгое прощание', start:serverDate(2026,7,30,6,0), end:serverDate(2026,9,9,6,0)},
  {game:'wuwa', version:'3.6', title:"Lamplight in Mirage, Sword's Resolve in Heart", start:serverDate(2026,8,20,3,59), end:serverDate(2026,9,29,3,59)},
  {game:'nte', version:'1.3', title:'Rising from the Moonlit Fog', titleRu:'Восстав из лунного тумана', start:serverDate(2026,8,20,5,59), end:serverDate(2026,9,30,5,59)},
  {game:'endfield', version:'1.4', title:'Homecoming', titleRu:'Возвращение домой', start:serverDate(2026,7,30,11,59), end:serverDate(2026,8,30,11,59)},
  {game:'nikki', version:'2.8', title:'Golden Dust', titleRu:'Golden Dust', start:serverDate(2026,7,31,3,49), end:serverDate(2026,8,28,3,49)}
];
let currentModalId=null;

let events = [
  {id:1,game:'nikki',title:'Вдохновение в мгновение',desc:'Получите двойные награды в царстве Эврики!',start:d(-2),end:d(1.55),done:false,category:'event'},
  {id:2,game:'zzz',title:'Фокусный разбор: столкновение',desc:'Пройдите боевые испытания и заберите временные награды.',start:d(-1.8),end:d(3.55),done:false,category:'event'},
  {id:3,game:'genshin',title:'Взаимопомощь в цвету: Фронтиры',desc:'Делайте снимки и выполняйте цели исследовательского события.',start:d(-1.4),end:d(3.7),done:false,category:'event'},
  {id:4,game:'hsr',title:'Сад изобилия 4.4',desc:'Получайте двойные награды за прохождение Золотых и Багровых чашелистиков.',start:d(-1.1),end:d(5.55),done:false,category:'event'},
  {id:5,game:'genshin',title:'Веб-событие «Путеводитель по Снежной»',desc:'Зарабатывайте награды за выполнение заданий и изучение новых механик.',start:d(-.7),end:d(7.4),done:false,category:'event'},
  {id:6,game:'hsr',title:'Антигравитационный разрушитель',desc:'Помогите Авантюрину исследовать заражённый информационный блок.',start:d(-5),end:d(10.55),done:false,category:'event'},
  {id:7,game:'wuwa',title:'Эхо прошлого: испытание',desc:'Пройдите серию боевых этапов и получите материалы для развития.',start:d(-3),end:d(12),done:false,category:'event'},
  {id:8,game:'nte',title:'Полевые исследования Эвернесс',desc:'Исследуйте районы города и завершите временные поручения.',start:d(-1),end:d(8),done:false,category:'event'},
  {id:9,game:'zzz',title:'Улица, где живут истории',desc:'Соберите события дня и откройте дополнительные награды.',start:d(-2),end:d(6),done:false,category:'event'}
];


// Автоматическая загрузка событий через локальный Node-сервер.
// Сервер забирает данные с внешних источников и тем самым обходит CORS.
let eventsLastUpdated = null;
let eventsSnapshotUpdatedAt = null;
let eventsAutoSource = Object.fromEntries(['genshin','hsr','zzz','wuwa','endfield','nte','nikki'].map(x=>[x,false]));
let eventsSnapshotSource = Object.fromEntries(['genshin','hsr','zzz','wuwa','endfield','nte','nikki'].map(x=>[x,false]));

function preserveDone(oldEvents, remote){
  const map=new Map(oldEvents.map(e=>[`${e.game}|${e.title}`,!!e.done]));
  return remote.map(e=>({...e,done:map.get(`${e.game}|${e.title}`)??false}));
}
function applyRemoteEvents(remoteEvents){
  events=preserveDone(events,remoteEvents);
  eventsLastUpdated=new Date();
  renderAll();
}

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

function localizeZZZText(value){
  const text=String(value??'').trim();
  return zzzRussianTitles[text] || text;
}
function localizeZZZDescription(title,desc){
  const key=String(title??'').trim();
  return zzzRussianDescriptions[key] || String(desc??'');
}
function localizeGameTitle(game,title){
  const value=String(title??'').trim();
  if(game==='wuwa') return wuwaEnglishTitles[value] || value;
  if(game==='zzz') return localizeZZZText(value);
  return value;
}

function classifyEvent(raw,game,title=''){
  const text=String(title||raw?.name||raw?.title||'').toLowerCase();
  const id=String(raw?.id ?? raw?.activity_id ?? raw?.event_id ?? '');
  // Повторяющиеся боевые/игровые режимы отделяем от обычных событий.
  const challengeType=String(raw?.challenge_type || raw?.type_name || '').toLowerCase();
  if(game==='zzz' && ['deadly_assault','shiyu_defense','threshold_simulation','annihilation_simulacrum'].includes(challengeType)) return 'mode';

  const modePatterns = [
    'опасный штурм','оборона шиюй','бездна','мрачный натиск','нулевая каверна','зона нулевой каверны','задани[ея] легенд','башня невзгод','шепчущие пустоши','конечная матрица','фантазии тысячи врат',
    '幽境危战','盛材移涌','混沌回忆','虚构叙事','末日幻影','位面分裂','异器盈界','声弦涤荡',
    '群声共振模拟域','сверхсложн','испытани[ея] бездн','stygian onslaught','spiral abyss',
    'zero cavern','legend quest','memory of chaos','pure fiction','apocalyptic shadow','tower of adversity','whimpering wastes','endstate matrix','fantasies of the thousand gateways'
  ];
  if(modePatterns.some(p=>new RegExp(p,'i').test(text))) return 'mode';
  // Некоторые источники помечают режимы только ID-активности. Оставляем обычные activity
  // события событиями, чтобы временные ивенты не исчезали в разделе режимов.
  return 'event';
}

function normalizeRemoteEvent(raw,game,index,source){
  const id=raw.id ?? raw.activity_id ?? raw.event_id ?? raw.ann_id ?? `${game}-${index}`;
  const title=localizeGameTitle(game, raw.name ?? raw.title ?? raw.eventName ?? raw.activity_name);
  const descRaw=raw.description ?? raw.desc ?? raw.summary ?? '';
  const desc=game==='zzz' ? localizeZZZDescription(raw.name ?? raw.title ?? raw.eventName ?? raw.activity_name, descRaw) : descRaw;
  const startRaw=raw.start_time ?? raw.startTime ?? raw.start_at ?? raw.start;
  const endRaw=raw.end_time ?? raw.endTime ?? raw.end_at ?? raw.end;
  const start=typeof startRaw==='number' ? new Date(startRaw*1000) : new Date(startRaw);
  const end=typeof endRaw==='number' ? new Date(endRaw*1000) : new Date(endRaw);
  if(!title || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end<=start) return null;
  return {id:`${source}:${game}:${id}`,game,title:String(title),desc:String(desc),start,end,done:false,source,url:raw.url||raw.link||'',category:raw.category==='mode'?'mode':classifyEvent(raw,game,title)};
}
async function fetchJson(url){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const res=await fetch(url,{signal:controller.signal,cache:'no-store'});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }finally{clearTimeout(timer)}
}

async function loadOneSource(game){
  try{
    const endpoint=['nte','nikki','endfield'].includes(game)
      ? `/api/official-events?game=${game}`
      : `/api/events?game=${game}`;
    const data=await fetchJson(endpoint);
    let list=Array.isArray(data?.events)?[...data.events]:[];
    if(game==='zzz' && Array.isArray(data?.challenges)){
      for(const challenge of data.challenges){
        if(['deadly_assault','shiyu_defense'].includes(String(challenge.type_name||challenge.challenge_type))){
          list.push({...challenge,title:challenge.name,challenge_type:challenge.type_name,category:'mode'});
        }
      }
    }
    const normalized=list.map((x,i)=>normalizeRemoteEvent(x,game,i,data.source?'calendar':'official')).filter(Boolean).filter(e=>e.end>new Date());
    if(normalized.length){eventsAutoSource[game]=true;return normalized;}
  }catch(err){console.warn(`EVENTCLOCK: источник ${game} недоступен`,err)}
  eventsAutoSource[game]=false;
  return [];
}

async function loadEventsSnapshot(){
  try{
    const data=await fetchJson('/events.json');
    const list=Array.isArray(data?.events)?data.events:[];
    const normalized=list.map((x,i)=>normalizeRemoteEvent(x,x.game,i,'snapshot')).filter(Boolean).filter(e=>e.end>new Date());
    if(normalized.length){
      eventsSnapshotUpdatedAt=data.updatedAt?new Date(data.updatedAt):null;
      const gamesToLoad=['genshin','hsr','zzz','wuwa','endfield','nte','nikki'];
      eventsSnapshotSource=Object.fromEntries(gamesToLoad.map(game=>[game,normalized.some(e=>e.game===game)]));
      return normalized;
    }
  }catch(err){
    console.warn('EVENTCLOCK: резервный снимок событий недоступен',err);
  }
  return [];
}

function zzzZeroCavernMode(){
  // Нулевая каверна не приходит в Ennead /challenges.
  // Поэтому рассчитываем текущую недельную границу автоматически.
  // Для пользователя UTC+4 сброс — каждый понедельник в 07:00.
  const nowUtc=new Date();
  const local=new Date(nowUtc.getTime()+USER_UTC_OFFSET*60*60*1000);
  const dayOfWeek=local.getUTCDay(); // 0=вс, 1=пн, ...
  const daysSinceMonday=(dayOfWeek+6)%7;

  const endLocal=new Date(local);
  endLocal.setUTCDate(local.getUTCDate() + (7-daysSinceMonday));
  endLocal.setUTCHours(7,0,0,0);

  const startLocal=new Date(endLocal.getTime()-7*day);
  const start=new Date(startLocal.getTime()-USER_UTC_OFFSET*60*60*1000);
  const end=new Date(endLocal.getTime()-USER_UTC_OFFSET*60*60*1000);

  return {
    id:`manual:zzz:zero-cavern:${end.toISOString().slice(0,10)}`,
    game:'zzz',
    title:'Нулевая каверна',
    desc:'Постоянный боевой режим. Еженедельные награды и задания Нулевой каверны.',
    start,
    end,
    done:false,
    source:'manual',
    category:'mode'
  };
}

function manualModes(){
  // Режимы, которые не всегда приходят из календарного API как обычные события.
  // Даты актуальны для версии 7.0 на 27.08.2026.
  return [
    {id:'manual:genshin:abyss-2026-08',game:'genshin',title:'Бездна',desc:'Текущий сезон Витой Бездны. Сброс цикла — 16 сентября.',start:new Date('2026-08-16T04:00:00+04:00'),end:new Date('2026-09-16T04:00:00+04:00'),done:false,source:'manual',category:'mode'},
    {id:'manual:genshin:theater-2026-08',game:'genshin',title:'Театр Воображариум',desc:'Августовский сезон. Новый сезон откроется 1 сентября.',start:new Date('2026-08-01T04:00:00+04:00'),end:new Date('2026-09-01T04:00:00+04:00'),done:false,source:'manual',category:'mode'},
    {id:'manual:genshin:stygian-2026-08',game:'genshin',title:'Мрачный натиск',desc:'Текущий цикл Мрачного натиска версии 7.0.',start:new Date('2026-08-19T10:00:00+04:00'),end:new Date('2026-09-22T03:59:00+04:00'),done:false,source:'manual',category:'mode'},
    zzzZeroCavernMode(),
    {id:'manual:hsr:apocalyptic-shadow-2026-08',game:'hsr',title:'Апокалиптическая тень',desc:'Текущий цикл Апокалиптической тени. Завершение цикла — 31 августа.',start:new Date('2026-07-20T05:00:00+04:00'),end:new Date('2026-08-31T05:00:00+04:00'),done:false,source:'manual',category:'mode'},
    {id:'manual:hsr:pure-fiction-2026-08',game:'hsr',title:'Чистый вымысел',desc:'Текущий цикл Чистого вымысла. Завершение цикла — 14 сентября.',start:new Date('2026-08-03T05:00:00+04:00'),end:new Date('2026-09-14T05:00:00+04:00'),done:false,source:'manual',category:'mode'},
    {id:'manual:hsr:memory-of-chaos-2026-08',game:'hsr',title:'Зал Забвения',desc:'Текущий цикл Зала Забвения: Память Хаоса. Завершение цикла — 28 сентября.',start:new Date('2026-08-17T05:00:00+04:00'),end:new Date('2026-09-28T05:00:00+04:00'),done:false,source:'manual',category:'mode'},
    {id:'manual:wuwa:tower-of-adversity-2026-08',game:'wuwa',title:'Tower of Adversity',desc:'Current Tower of Adversity cycle. Current cycle ends September 14.',start:new Date('2026-08-17T04:00:00+04:00'),end:new Date('2026-09-14T04:00:00+04:00'),done:false,source:'manual',category:'mode'},
    {id:'manual:wuwa:whimpering-wastes-2026-08',game:'wuwa',title:'Whispering Wastes',desc:'Current Whispering Wastes cycle. Reset — August 31.',start:new Date('2026-08-03T04:00:00+04:00'),end:new Date('2026-08-31T04:00:00+04:00'),done:false,source:'manual',category:'mode'},
    {id:'manual:wuwa:endstate-matrix-2026-08',game:'wuwa',title:'Endstate Matrix',desc:'Current Endstate Matrix phase. Phase ends September 30.',start:new Date('2026-08-27T04:00:00+04:00'),end:new Date('2026-09-30T04:00:00+04:00'),done:false,source:'manual',category:'mode'},
    {id:'manual:wuwa:fantasies-thousand-gateways-2026-08',game:'wuwa',title:'Fantasies of the Thousand Gateways',desc:'Current weekly rotation. Refreshes August 31.',start:new Date('2026-08-24T04:00:00+04:00'),end:new Date('2026-08-31T04:00:00+04:00'),done:false,source:'manual',category:'mode'}
  ];
}

async function loadRemoteEvents(){
  const gamesToLoad=['genshin','hsr','zzz','wuwa','endfield','nte','nikki'];
  eventsAutoSource=Object.fromEntries(gamesToLoad.map(x=>[x,false]));
  eventsSnapshotSource=Object.fromEntries(gamesToLoad.map(x=>[x,false]));

  // Сначала загружаем последний снимок из GitHub. Он нужен как страховка,
  // если внешний API временно недоступен или Cloudflare не может достучаться до него.
  const snapshot=await loadEventsSnapshot();
  const loaded=await Promise.all(gamesToLoad.map(loadOneSource));
  const liveByGame=Object.fromEntries(gamesToLoad.map((game,i)=>[game,loaded[i]]));

  const merged=[];
  for(const game of gamesToLoad){
    const live=liveByGame[game]||[];
    const backup=snapshot.filter(e=>e.game===game);
    const legacy=events.filter(e=>e.game===game && e.end>new Date());
    if(live.length) merged.push(...live);
    else if(backup.length) merged.push(...backup);
    else merged.push(...legacy);
  }

  const manual=manualModes();
  const manualKeys=new Set(manual.map(m=>`${m.game}|${String(m.title).trim().toLowerCase()}`));
  const mergedWithModes=[
    ...merged.filter(e=>!manualKeys.has(`${e.game}|${String(e.title).trim().toLowerCase()}`)),
    ...manual
  ];
  if(mergedWithModes.length) applyRemoteEvents(mergedWithModes);
  updateEventsSyncStatus();
}
function updateEventsSyncStatus(){
  const el=document.querySelector('#eventsSyncStatus');if(!el)return;
  const total=7,live=Object.values(eventsAutoSource).filter(Boolean).length,backup=Object.values(eventsSnapshotSource).filter(Boolean).length;
  if(eventsLastUpdated){
    const backupText=backup?` · резерв ${backup}/${total}`:'';
    el.textContent=`Автообновление · онлайн ${live}/${total}${backupText} · ${eventsLastUpdated.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`;
  }else{
    el.textContent=`Автообновление · проверяю ${total} источников…`;
  }
}

loadRemoteEvents();
setInterval(loadRemoteEvents,30*60*1000);

// Ежедневные поручения — отдельный трекер, не смешиваем их с временными событиями.
const dailyConfig = [
  {id:'genshin', name:'Геншин', color:'#3ca9e5', resetMsk:6},
  {id:'hsr', name:'ХСР', color:'#6a2ab4', resetMsk:6},
  {id:'wuwa', name:'Вува', color:'#7d8b9d', resetMsk:6},
  {id:'zzz', name:'ZZZ', color:'#e39a26', resetMsk:6},
  {id:'nte', name:'НТЕ', color:'#62d6e6', resetMsk:6},
  {id:'endfield', name:'Эндфилд', color:'#d8a84e', resetMsk:11},
  {id:'nikki', name:'Инфинити Никки', color:'#dc5a98', resetMsk:5}
];

function dailyPeriodKey(id){
  const cfg=dailyConfig.find(x=>x.id===id);
  if(!cfg) return '';
  const now=new Date();
  const localNow=new Date(now.getTime()+USER_UTC_OFFSET*60*60*1000);
  const resetHour=cfg.resetMsk+1;
  const reset=new Date(localNow);
  reset.setHours(resetHour,0,0,0);
  if(localNow<reset) reset.setDate(reset.getDate()-1);
  return `${id}-${reset.getUTCFullYear()}-${reset.getUTCMonth()+1}-${reset.getUTCDate()}`;
}

function dailyResetAt(id){
  const cfg=dailyConfig.find(x=>x.id===id);
  const now=new Date();
  const resetHourUtc=cfg.resetMsk+1-USER_UTC_OFFSET;
  const next=new Date(now);
  next.setUTCMinutes(0,0,0);
  next.setUTCHours(resetHourUtc);
  if(next<=now) next.setUTCDate(next.getUTCDate()+1);
  return next;
}

function dailyResetLeft(id){
  return Math.max(0,dailyResetAt(id)-new Date());
}

function dailyLocalHour(id){
  const cfg=dailyConfig.find(x=>x.id===id);
  return cfg.resetMsk+1;
}

function loadDailies(){
  try{return JSON.parse(localStorage.getItem('eventclock-dailies-v4')||'{}')}
  catch(e){return {}}
}

function saveDailies(state){
  localStorage.setItem('eventclock-dailies-v4',JSON.stringify(state));
}

function dailyDone(id){
  const state=loadDailies();
  return !!state[dailyPeriodKey(id)];
}

function setDailyDone(id,value){
  const state=loadDailies();
  state[dailyPeriodKey(id)]=!!value;
  saveDailies(state);
}

function formatDailyLeft(ms){
  const total=Math.max(0,Math.floor(ms/60000));
  const days=Math.floor(total/1440);
  const hours=Math.floor((total%1440)/60);
  const mins=total%60;
  if(days>0) return `${days}д ${hours}ч`;
  return `${hours}ч ${String(mins).padStart(2,'0')}м`;
}

let selected='all';
let categoryMode='all';
let sortMode='ending';
let viewMode='checklist';

const focusGameOrder=['all','endfield','genshin','hsr','nikki','nte','wuwa','zzz'];
const focusGameLabels={all:'All',endfield:'Endfield',genshin:'Genshin',hsr:'Star Rail',nikki:'Nikki',nte:'NTE',wuwa:'WuWa',zzz:'ZZZ'};


function formatLeft(ms){
  if(ms<=0) return 'завершено';
  const totalMin=Math.floor(ms/60000), days=Math.floor(totalMin/1440), hours=Math.floor((totalMin%1440)/60), mins=totalMin%60;
  if(days>0) return `${days}д ${hours}ч`;
  if(hours>0) return `${hours}ч ${mins}м`;
  return `${mins}м`;
}
function formatDate(x){ return x.toLocaleDateString('ru-RU',{day:'numeric',month:'short'}).replace(' г.',''); }
function timeClass(ms){
  if(ms <= 2*day) return 'under1';       // 1–2 дня — красный
  if(ms <= 5*day) return 'under3';       // 3–5 дней — оранжевый
  if(ms < 7*day) return 'underweek';     // меньше 7 дней — жёлтый
  return 'week';                         // 7+ дней — нейтральный
}
function visibleEvents(){
  const nowDate = new Date();
  const sevenDaysLater = new Date(nowDate.getTime() + 7*day);

  let arr;

  // Вкладка «Временные режимы» должна показывать все активные режимы,
  // даже если их окончание не попадает в ближайшие 7 дней.
  // Иначе постоянные/длинные режимы вроде Нулевой каверны пропадают.
  if(categoryMode === 'mode'){
    arr = events.filter(e => e.end > nowDate && (e.category || 'event') === 'mode');
  } else if(sortMode === 'ending'){
    // «Скорее закончится» — показываем ВСЕ активные элементы,
    // включая временные режимы, если они заканчиваются в ближайшие 7 дней.
    // Категория фильтруется отдельно через «Все / События / Временные режимы».
    arr = events.filter(e => e.end > nowDate && e.end <= sevenDaysLater);
    if(categoryMode === 'event'){
      arr = arr.filter(e => (e.category || 'event') === 'event');
    }
  } else {
    // «Сначала дела» — показываем все активные элементы.
    // В режиме «Все» сюда входят и обычные события, и временные режимы.
    // Отдельные фильтры «События» / «Временные режимы» дополнительно
    // ограничивают список по категории.
    arr = events.filter(e => e.end > nowDate);
    if(categoryMode === 'event'){
      arr = arr.filter(e => (e.category || 'event') === 'event');
    } else if(categoryMode === 'mode'){
      arr = arr.filter(e => (e.category || 'event') === 'mode');
    }
  }

  // Фильтр игры.
  if(selected !== 'all' && selected !== 'ended'){
    arr = arr.filter(e => e.game === selected);
  }

  // Отдельная вкладка завершённых.
  if(selected === 'ended'){
    arr = events.filter(e => e.end <= nowDate);
  }

  if(categoryMode !== 'all' && selected === 'ended') arr = arr.filter(e => (e.category || 'event') === categoryMode);

  if(sortMode === 'ending'){
    arr.sort((a,b) => a.end - b.end);
  } else {
    arr.sort((a,b) => Number(a.done) - Number(b.done) || a.end - b.end);
  }

    return arr;
}

function renderFilters(){
  const nowDate=new Date();
  const counts={};
  Object.keys(games).forEach(k=>counts[k]=k==='all'?events.filter(e=>e.end>nowDate).length:events.filter(e=>e.game===k&&e.end>nowDate).length);
  const order=['all','ended','genshin','hsr','nikki','nte','endfield','wuwa','zzz'];
  const root=document.querySelector('#filters');
  if(root){
    root.innerHTML=order.map(k=>`<button class="chip ${selected===k?'active':''} game-${k}" data-game="${k}">${games[k].short||games[k].name} <span>${k==='ended'?events.filter(e=>e.end<=nowDate).length:counts[k]}</span></button>`).join('');
    root.querySelectorAll('.chip').forEach(b=>b.onclick=()=>{selected=b.dataset.game;renderAll()});
  }
  renderDoingFocus(counts,nowDate);
}

function renderDoingFocus(counts,nowDate=new Date()){
  const section=document.querySelector('#doingFocus');
  const root=document.querySelector('#doingFocusChips');
  if(!section||!root)return;
  const visible=sortMode==='doing' && viewMode==='checklist';
  section.hidden=!visible;
  if(!visible)return;
  root.innerHTML=focusGameOrder.map(k=>{
    const count=k==='all'
      ? events.filter(e=>e.end>nowDate).length
      : events.filter(e=>e.game===k&&e.end>nowDate).length;
    return `<button class="focus-chip ${selected===k?'active':''} focus-${k}" data-focus-game="${k}">${focusGameLabels[k]} <span>${count}</span></button>`;
  }).join('');
  root.querySelectorAll('[data-focus-game]').forEach(button=>{
    button.onclick=()=>{
      selected=button.dataset.focusGame;
      renderAll();
    };
  });
}

function progressParts(e){
  const total=e.end-e.start, left=Math.max(0,e.end-new Date()), pct=Math.min(1,Math.max(0,1-left/total));
  const on=Math.round(pct*26); return Array.from({length:26},(_,i)=>`<span class="${i<on?'on':''}"></span>`).join('');
}
function renderEvents(){
  const arr=visibleEvents();
  const list=document.querySelector('#eventList');
  if(!arr.length){
    const message = categoryMode === 'mode'
      ? 'Сейчас нет активных временных режимов.'
      : sortMode === 'ending'
        ? 'Нет событий, заканчивающихся в ближайшие 7 дней.'
        : 'Нет активных или будущих событий.';
    list.innerHTML=`<div class="empty">${message}</div>`;
    return;
  }
  list.innerHTML=arr.map(e=>{
    const g=games[e.game], left=e.end-new Date(), tc=timeClass(left);
    const categoryLabel=e.category==='mode'?'ВРЕМЕННЫЙ РЕЖИМ':'СОБЫТИЕ';
    const timeColor=tc==='week'?'#7b8498':tc==='underweek'?'#efcf45':tc==='under3'?'#ef8f32':'#ef4f5f';
    return `<article class="event-row ${e.done?'event-done':''}" data-event-id="${e.id}" style="--game-color:${g.color};--time-color:${timeColor}">
      <div class="event-top">
        <div class="event-main-info">
          <div class="game-name">${g.name} · ${categoryLabel}</div>
          <div class="event-title">${e.title}</div>
          <div class="event-desc">${e.desc}</div>
        </div>
        <div class="event-deadline">
          <div class="time-left">${formatLeft(left)}</div>
          <div class="deadline-caption">до конца</div>
        </div>
      </div>
      <div class="event-progress">${progressParts(e)}</div>
      <div class="event-meta">${formatDate(e.start)} — ${formatDate(e.end)} · ${Math.max(1,Math.ceil((e.end-e.start)/day))} дн. события</div>
      <div class="event-arrow">›</div>
    </article>`;
  }).join('');
  document.querySelectorAll('.event-row').forEach(row=>row.onclick=()=>openEvent(row.dataset.eventId));
}

function renderNext(){
  const arr=visibleEvents(); if(!arr.length) return;
  if(!document.querySelector('#nextTitle')) return;
  const e=arr[0], g=games[e.game], left=e.end-new Date();
  document.querySelector('#nextTitle').textContent=e.title;
  document.querySelector('#nextGame').textContent=g.name;
  document.querySelector('#nextGame').style.color=g.color;
  document.querySelector('#nextTime').textContent=formatLeft(left);
  document.querySelector('#nextMeta').textContent=`${formatDate(e.start)} — ${formatDate(e.end)}`;
  const total=e.end-e.start, pct=Math.min(1,Math.max(0,1-left/total));
  document.querySelector('#bigProgress').innerHTML=Array.from({length:20},(_,i)=>`<span class="${i<Math.round(pct*20)?'on':''}"></span>`).join('');
  document.querySelector('#bigProgress').querySelectorAll('.on').forEach(x=>x.style.background=g.color);
  document.querySelector('#thenList').innerHTML=arr.slice(1,3).map(x=>`<div class="then-item" data-event-id="${x.id}"><span class="then-dot" style="background:${games[x.game].color}"></span><span>${x.title}</span><span class="then-time">${formatLeft(x.end-new Date())}</span></div>`).join('');
}

function renderDailies(){
  const doneCount=dailyConfig.filter(x=>dailyDone(x.id)).length;
  const count=document.querySelector('#dailyCount');
  if(count) count.textContent=`${doneCount}/${dailyConfig.length} выполнено`;

  const root=document.querySelector('#dailyChips');
  if(!root) return;

  root.innerHTML=dailyConfig.map(cfg=>{
    const done=dailyDone(cfg.id);
    const left=dailyResetLeft(cfg.id);
    const localHour=String(dailyLocalHour(cfg.id)).padStart(2,'0');

    return `<button class="daily-game ${done?'is-done':''}" data-daily="${cfg.id}" style="--daily-color:${cfg.color}">
      <span class="daily-game-accent"></span>
      <span class="daily-game-main">
        <span class="daily-game-name">${cfg.name}</span>
        <span class="daily-game-status">${done?'Выполнено':'Поручение не выполнено'}</span>
      </span>
      <span class="daily-game-right">
        <span class="daily-game-countdown">${done?'✓':formatDailyLeft(left)}</span>
        <span class="daily-game-reset">${done?'готово на сегодня':`сброс в ${localHour}:00`}</span>
      </span>
      <span class="daily-game-check">${done?'✓':'○'}</span>
    </button>`;
  }).join('');

  root.querySelectorAll('[data-daily]').forEach(button=>{
    button.onclick=()=>{
      const id=button.dataset.daily;
      setDailyDone(id,!dailyDone(id));
      renderDailies();
    };
  });

  const waiting=document.querySelector('#waitingText');
  if(waiting){
    const left=dailyConfig.length-doneCount;
    waiting.textContent=left
      ? `${left} ${left===1?'игра':'игр'} ещё жд${left===1?'ёт':'ут'} тебя сегодня`
      : 'Все ежедневные поручения выполнены';
  }
}
function renderCounts(){
  document.querySelector('#liveCount').textContent=events.filter(e=>e.start<=new Date()&&e.end>new Date()).length;
  document.querySelector('#upcomingCount').textContent=events.filter(e=>e.start>new Date()).length;
}
function renderTimeline(){
  const arr=visibleEvents(), root=document.querySelector('#timeline');
  const start=new Date(); start.setHours(0,0,0,0);
  const days=Array.from({length:7},(_,i)=>new Date(start.getTime()+i*day));
  root.innerHTML=`<div class="timeline-header"><div>СОБЫТИЯ</div><div>${days.map(x=>`<span class="timeline-day">${x.toLocaleDateString('ru-RU',{weekday:'short',day:'numeric'})}</span>`).join('')}</div></div>`+arr.map(e=>{const g=games[e.game];const total=7*day;const s=Math.max(0,e.start-start), en=Math.min(total,e.end-start);const left=Math.max(0,s), width=Math.max(2,Math.min(total,en)-left);return `<div class="timeline-row"><div class="timeline-label"><b>${g.short||g.name}</b><br>${e.title}</div><div class="timeline-track"><div class="timeline-bar" style="--game-color:${g.color};left:${left/total*100}%;width:${width/total*100}%">${e.title}</div></div></div>`}).join('');
}
function updateReset(){ renderDailies(); }

function renderPatch(){
  const root=document.querySelector('#patchList');
  if(!root) return;
  const nowDate=new Date();

  // Сначала показываем патч, который закончится раньше всего.
  const orderedPatches=[...patches].sort((a,b)=>a.end-b.end);

  root.innerHTML=orderedPatches.map(p=>{
    const g=games[p.game];
    const left=Math.max(0,p.end-nowDate);
    const total=Math.max(1,p.end-p.start);
    const progress=Math.min(1,Math.max(0,1-left/total));
    const filled=Math.round(progress*16);
    const expired=left<=0;

    return `<article class="patch-card-item" style="--patch-color:${g.color}">
      <div class="patch-card-top">
        <span class="patch-card-label">ПАТЧ</span>
        <span class="patch-card-game">${g.short||g.name}</span>
      </div>

      <div class="patch-card-title">${g.short||g.name}</div>
      <div class="patch-card-version">${p.version}</div>
      <div class="patch-card-name">${p.titleRu || p.title}</div>

      <div class="patch-card-countdown">${expired?'Завершён':formatLeft(left)}</div>
      <div class="patch-card-subtitle">до конца патча</div>

      <div class="patch-card-progress">
        ${Array.from({length:16},(_,i)=>`<span class="${i<filled?'filled':''}"></span>`).join('')}
      </div>

      <div class="patch-card-dates">${formatDate(p.start)} — ${formatDate(p.end)}</div>
    </article>`;
  }).join('');
}
function openEvent(id){
  const e=events.find(x=>x.id===id); if(!e)return;
  currentModalId=id;
  const g=games[e.game];
  document.querySelector('#modalGame').textContent=g.name;
  document.querySelector('#modalGame').style.color=g.color;
  document.querySelector('#modalTitle').textContent=e.title;
  document.querySelector('#modalDesc').textContent=e.desc;
  document.querySelector('#modalStart').textContent=formatDate(e.start);
  document.querySelector('#modalEnd').textContent=formatDate(e.end);
  document.querySelector('#modalLeft').textContent=formatLeft(e.end-new Date());
  document.querySelector('#modalStatus').textContent=e.done?'Выполнено':(e.end>new Date()?'Активно':'Завершено');
  document.querySelector('#modalDone').textContent=e.done?'Вернуть в активные':'Отметить выполненным';
  document.querySelector('#eventModal').hidden=false;
}
function closeEvent(){document.querySelector('#eventModal').hidden=true;currentModalId=null;}
document.querySelector('#modalClose').onclick=closeEvent;
document.querySelector('#eventModal').onclick=e=>{if(e.target.id==='eventModal')closeEvent();};
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeEvent();});
document.querySelector('#modalDone').onclick=()=>{
  const e=events.find(x=>x.id===currentModalId); if(!e)return;
  e.done=!e.done;
  localStorage.setItem('eventclock-events',JSON.stringify(Object.fromEntries(events.map(x=>[x.id,x.done]))));
  renderAll(); openEvent(e.id);
};

function renderAll(){renderFilters();renderEvents();renderNext();renderDailies();renderCounts();renderTimeline();renderPatch();}

document.querySelectorAll('.sort-btn').forEach(b=>b.onclick=()=>{sortMode=b.dataset.sort;if(sortMode==='doing'&&selected==='ended')selected='all';document.querySelectorAll('.sort-btn').forEach(x=>x.classList.toggle('active',x===b));renderAll()});
document.querySelectorAll('.view-btn').forEach(b=>b.onclick=()=>{viewMode=b.dataset.view;document.querySelectorAll('.view-btn').forEach(x=>x.classList.toggle('active',x===b));document.querySelector('#eventList').hidden=viewMode==='timeline';document.querySelector('#timeline').hidden=viewMode!=='timeline';renderDoingFocus();});
document.querySelector('#catchUp').onclick=()=>{
  dailyConfig.forEach(x=>setDailyDone(x.id,true));
  renderDailies();
};

document.querySelectorAll('.category-btn').forEach(b=>b.onclick=()=>{
  categoryMode=b.dataset.category;
  document.querySelectorAll('.category-btn').forEach(x=>x.classList.toggle('active',x===b));
  renderAll();
});

const savedEvents = JSON.parse(localStorage.getItem('eventclock-events')||'null');
if(savedEvents) events.forEach(e=>{if(savedEvents[e.id]!==undefined)e.done=!!savedEvents[e.id];});
renderAll();
updateEventsSyncStatus();
setInterval(()=>{renderEvents();renderNext();renderCounts();renderTimeline();renderPatch();renderDailies()},1000);
updateReset();
