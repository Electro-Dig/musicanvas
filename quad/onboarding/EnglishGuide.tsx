import { BookMarked, MousePointer2, ArrowDownToLine, ArrowUpFromLine, Save } from 'lucide-react';
import type {OnboardingDemoId} from './OnboardingDemo';

type Tip={art:string;title:string;body:string};
const TIPS:Record<OnboardingDemoId,Tip[]>={
  start:[
    {art:'pads',title:'A–D: four canvases',body:'Build separate parts on pads A–D. Use the grid button to see all four together.'},
    {art:'sound',title:'Play and choose a sound',body:'Press Play and choose a sound in the pad toolbar. Give each pad its own voice.'},
    {art:'midi',title:'MIDI is optional',body:'Choose a MIDI output in the top bar, or use built-in sounds without external hardware.'},
  ],
  notes:[
    {art:'notes',title:'Place, move and remove',body:'Double-click to add a note; drag to move it. Right-click to remove any note except ROOT.'},
    {art:'pitch',title:'Edit the selected note',body:'Adjust pitch, paired notes and range in the sidebar. Mute keeps connections; Hide removes the note from propagation.'},
    {art:'root',title:'Start at ROOT',body:'Sound spreads from ROOT to connected notes. Move them to change the order you hear.'},
  ],
  motion:[
    {art:'orbit',title:'Orbit or line',body:'Choose a motion mode for a note. Adjust its path size, direction and cycle.'},
    {art:'draw',title:'Draw your own path',body:'Select a note, choose Draw and sketch a path. The note follows your line.'},
    {art:'blink',title:'Blink and reconnect',body:'Blink to change when notes participate. Move them closer or apart to change connections.'},
  ],
  groups:[
    {art:'select',title:'Select several notes',body:'Ctrl-click (⌘ on Mac) to select notes. Edit motion, copy or group them together.'},
    {art:'group',title:'Give the group a shape',body:'Choose a group shape. Drag its G1 handle to move all members together.'},
    {art:'move',title:'Make the group perform',body:'Move or blink together. Choose Chord to sound all notes at once.'},
  ],
  library:[
    {art:'library',title:'Open the Library',body:'Click Library in the top bar for your patterns, Pattern Plaza and templates.'},
    {art:'plaza',title:'Start in Pattern Plaza',body:'Load a shared pattern or canon study. Change its notes or sound to make it yours.'},
    {art:'exchange',title:'Keep it in My Patterns',body:'Save one pad or all four. Import and export files to back up or transfer your patterns.'},
  ],
};


const TIPS_ZH: Record<OnboardingDemoId, Tip[]> = {
  start: [
    {art:'pads', title:'四个画布，分层创作', body:'点击 A–D 切换声部，用四宫格按钮一起查看。'},
    {art:'sound', title:'播放并选择音色', body:'点击播放，在画布上方选择音色。每个画布都能拥有自己的声音。'},
    {art:'midi', title:'按需连接 MIDI', body:'在顶栏选择输出设备。不接外部设备，也能用内置音色创作。'},
  ],
  notes: [
    {art:'notes', title:'放下音符，连成旋律', body:'双击空白添加音符，拖动调整位置；右键删除非 ROOT 音符。'},
    {art:'pitch', title:'调整音符的细节', body:'左侧可调音高、双音符和范围。静音保留连接，隐藏则退出传播。'},
    {art:'root', title:'声音从 ROOT 出发', body:'播放从 ROOT 传向相连的音符。移动位置，就可能改变发声顺序。'},
  ],
  motion: [
    {art:'orbit', title:'沿圆形或线段运动', body:'选中音符，选择轨迹模式，再调整大小、方向和周期。'},
    {art:'draw', title:'亲手画一条路线', body:'选择「绘制」，为音符画出路径，它就会沿线移动。'},
    {art:'blink', title:'闪烁，让连接变化', body:'闪烁控制音符何时参与；移动时的靠近与远离，也会改变连接。'},
  ],
  groups: [
    {art:'select', title:'多选，一起编辑', body:'按住 Ctrl 点选（Mac 用 ⌘），统一编辑轨迹与运动、复制或组合。'},
    {art:'group', title:'给组合一个形状', body:'选择编队形状，拖动 G1 手柄，就能带着整组一起移动。'},
    {art:'move', title:'让整组一起演奏', body:'共享周期，一起移动或闪烁；选择「和弦」，多个音就能同时响起。'},
  ],
  library: [
    {art:'library', title:'打开图案库', body:'点击顶栏的图案库，查看我的素材、图案广场和常用模板。'},
    {art:'plaza', title:'从图案广场开始', body:'载入共享图案或卡农示例，改改音符和音色，开始自己的创作。'},
    {art:'exchange', title:'把灵感存进我的素材', body:'保存单个或全部画布；用导入、导出备份与转移图案。'},
  ],
};
const ART_ZH: Record<string,string> = {
 'PLAY / SOUND':'播放 / 音色', 'MIDI OUTPUT':'MIDI 输出', 'NOTE PITCH':'音符音高',
 '●  Device   ⌄':'●  输出设备   ⌄', 'Library':'图案库', 'My Patterns':'我的素材',
 'Pattern Plaza':'图案广场', 'Templates':'常用模板', 'PATTERN PLAZA':'图案广场',
 'Load →':'载入 →', 'MY PATTERNS':'我的素材', 'Your idea':'你的灵感', 'Save':'保存',
 'Import':'导入', 'Export':'导出', 'Sound spreads out':'声音向外传递',
 'Select · Edit · Copy':'多选 · 编辑 · 复制', 'One shape · One handle':'一个组合 · 一个手柄',
 'Shared motion':'一起运动', 'Chord trigger':'和弦齐奏', 'Orbit / Line':'圆形 / 线段',
 'A path drawn by you':'亲手画出的路径', 'On · Off · On':'出现 · 隐去 · 出现',
 'Double-click to add':'双击添加音符',
};

/** Shared bilingual vector diagrams with selectable instructional text. */
function GuideArt({kind,locale}:{kind:string;locale:'zh'|'en'}){
  const text=(value:string)=>locale==='zh'?(ART_ZH[value]??value):value;
  const note=(x:number,y:number,text:string,key=text)=><g key={key}><rect x={x-13} y={y-13} width="26" height="26" rx="3" fill="#243c32"/><text x={x} y={y+4} textAnchor="middle" fill="#fff" fontSize="10">{text}</text></g>;
  let drawing;
  if(kind==='pads')drawing=<>{['A','B','C','D'].map((s,i)=><g key={s}><rect x={22+i%2*96} y={16+Math.floor(i/2)*52} width="82" height="42" rx="8" fill={i===0?'#ca637f':'#d7e6dd'}/><text x={63+i%2*96} y={42+Math.floor(i/2)*52} textAnchor="middle" fill={i===0?'white':'#243c32'}>{s}</text></g>)}</>;
  else if(['sound','midi','pitch'].includes(kind))drawing=<><rect x="18" y="27" width="184" height="67" rx="12" fill="#f8fbf8" stroke="#a7c2b3"/><text x="34" y="52" fontSize="11" fill="#5f786b">{text(kind==='sound'?'PLAY / SOUND':kind==='midi'?'MIDI OUTPUT':'NOTE PITCH')}</text><text x="34" y="77" fontSize="15" fill="#243c32">{text(kind==='sound'?'▶  Crystal Pluck':kind==='midi'?'●  Device   ⌄':'−     C4     +')}</text></>;
  else if(kind==='library')drawing=<>
    <rect x="17" y="9" width="115" height="30" rx="15" fill="#f8fbf8" stroke="#a7c2b3"/>
    <BookMarked x="27" y="17" width="15" height="15" color="#243c32" strokeWidth="1.8"/><text x="49" y="29" fontSize="11" fill="#243c32">{text('Library')}</text>
    <MousePointer2 x="110" y="29" width="19" height="19" color="#ca637f" fill="#e8f0e9"/>
    <path d="M 119 51 Q 124 65 141 65" fill="none" stroke="#6a9985" strokeWidth="1.5"/>
    <rect x="54" y="55" width="151" height="63" rx="8" fill="#f8fbf8" stroke="#a7c2b3"/>
    {['My Patterns','Pattern Plaza','Templates'].map((t,i)=><g key={t}><rect x="65" y={65+i*16} width="5" height="5" rx="1" fill={i===1?'#ca637f':'#9bbca9'}/><text x="78" y={71+i*16} fontSize="10" fill="#243c32">{text(t)}</text></g>)}
  </>;
  else if(kind==='plaza')drawing=<>
    <text x="17" y="22" fontSize="11" fill="#5f786b">{text('PATTERN PLAZA')}</text>
    {[0,1,2].map(i=><g key={i}><rect x={16+i*66} y={i===1?33:39} width="57" height="63" rx="7" fill="#f8fbf8" stroke={i===1?'#ca637f':'#a7c2b3'}/>
      {i===0?<path d="M 25 73 Q 36 40 44 68 T 65 56" fill="none" stroke="#6a9985" strokeWidth="2"/>:i===1?<g stroke="#6a9985" fill="none"><path d="M110 85 L110 43 M110 56 Q85 53 91 43 Q106 44 110 56 M110 67 Q137 66 129 53 Q111 55 110 67 M110 78 Q87 76 91 65 Q106 66 110 78"/></g>:<path d="M157 82 Q177 30 192 60 Q202 84 176 83 Q160 74 180 60" fill="none" stroke="#6a9985" strokeWidth="2"/>}
    </g>)}
    <rect x="83" y="96" width="57" height="21" rx="10" fill="#243c32"/><text x="111" y="110" textAnchor="middle" fill="#fff" fontSize="10">{text('Load →')}</text>
  </>;
  else if(kind==='exchange')drawing=<>
    <rect x="31" y="12" width="157" height="73" rx="10" fill="#f8fbf8" stroke="#a7c2b3"/>
    <Save x="43" y="23" width="15" height="15" color="#6a9985"/><text x="65" y="35" fontSize="11" fill="#243c32">{text('MY PATTERNS')}</text>
    <path d="M 43 49 H174" stroke="#d7e6dd"/><text x="44" y="64" fontSize="10" fill="#5f786b">{text('Your idea')}</text><rect x="131" y="53" width="45" height="20" rx="7" fill="#ca637f"/><text x="153" y="67" textAnchor="middle" fontSize="10" fill="#fff">{text('Save')}</text>
    <ArrowDownToLine x="45" y="96" width="15" height="15" color="#6a9985"/><text x="65" y="108" fontSize="10" fill="#243c32">{text('Import')}</text>
    <ArrowUpFromLine x="125" y="96" width="15" height="15" color="#6a9985"/><text x="145" y="108" fontSize="10" fill="#243c32">{text('Export')}</text>
  </>;
  else if(kind==='root')drawing=<>
    <circle cx="110" cy="61" r="31" fill="#d7e6dd" fillOpacity=".5" stroke="#6a9985" strokeOpacity=".6"/>
    <circle cx="110" cy="61" r="55" fill="none" stroke="#6a9985" strokeOpacity=".35"/>
    <path d="M 110 61 L47 43 M110 61 L174 38 M110 61 L158 94" stroke="#9bbca9" strokeDasharray="3 4"/>
    {note(47,43,'C4')}{note(174,38,'E4')}{note(158,94,'G4')}
    <rect x="91" y="48" width="38" height="26" rx="4" fill="#ca637f"/><text x="110" y="65" textAnchor="middle" fill="#fff" fontSize="10">ROOT</text>
    <text x="74" y="124" textAnchor="middle" fill="#5f786b" fontSize="10">{text('Sound spreads out')}</text>
  </>;
  else if(kind==='select')drawing=<>
    {note(38,40,'C4')}{note(124,27,'G4')}{note(168,83,'E4')}
    <g opacity=".22">{note(72,88,'A4')}</g>
    {[[38,40],[124,27],[168,83]].map(([x,y])=><rect key={x} x={x-17} y={y-17} width="34" height="34" rx="6" fill="none" stroke="#ca637f" strokeWidth="1.5"/>)}
    <MousePointer2 x="184" y="93" width="17" height="17" color="#243c32" fill="#e8f0e9"/>
    <rect x="20" y="107" width="42" height="18" rx="5" fill="#f8fbf8" stroke="#a7c2b3"/><text x="41" y="119" textAnchor="middle" fontSize="10" fill="#243c32">Ctrl</text>
    <text x="69" y="120" fontSize="10" fill="#5f786b">{text('Select · Edit · Copy')}</text>
  </>;
  else if(kind==='group')drawing=<>
    <ellipse cx="108" cy="58" rx="61" ry="39" fill="none" stroke="#9bbca9"/>
    <path d="M108 58 L48 57 M108 58 L107 19 M108 58 L168 59 M108 58 L110 96" stroke="#9bbca9" strokeDasharray="3 4"/>
    {note(48,57,'C4')}{note(107,19,'E4')}{note(168,59,'G4')}{note(110,96,'B4')}
    <circle cx="108" cy="58" r="15" fill="#ca637f"/><text x="108" y="62" textAnchor="middle" fontSize="10" fill="#fff">G1</text>
    <MousePointer2 x="117" y="67" width="17" height="17" color="#243c32" fill="#e8f0e9"/>
    <text x="110" y="124" textAnchor="middle" fill="#5f786b" fontSize="10">{text('One shape · One handle')}</text>
  </>;
  else if(kind==='move')drawing=<>
    <path d="M 26 76 C 0 15 100 9 101 64 Q 102 91 70 92" fill="none" stroke="#6a9985" strokeWidth="1.6"/>
    <path d="M73 86 L66 92 L74 97" fill="none" stroke="#6a9985" strokeWidth="1.6"/>
    <g transform="translate(12 1) scale(.78)">{note(33,77,'C4')}{note(62,55,'E4')}{note(83,83,'G4')}</g>
    <path d="M118 17 V98" stroke="#c4d6cb"/>
    {[29,60,91].map((y,i)=><g key={y}><path d={`M 148 ${y} H201`} stroke="#ca637f" strokeWidth="2"/>{note(152,y,['C4','E4','G4'][i])}</g>)}
    <path d="M190 17 V104" stroke="#ca637f" strokeWidth="1.5" strokeDasharray="3 3"/>
    <text x="57" y="123" textAnchor="middle" fontSize="10" fill="#5f786b">{text('Shared motion')}</text><text x="166" y="123" textAnchor="middle" fontSize="10" fill="#5f786b">{text('Chord trigger')}</text>
  </>;
  else if(['orbit','draw','blink'].includes(kind))drawing=<><path d={kind==='orbit'?'M 52 62 a 55 37 0 1 0 110 0 a 55 37 0 1 0 -110 0':kind==='draw'?'M 26 89 C 32 5 100 21 82 69 S 170 110 194 29':'M 28 65 L 192 65'} fill="none" stroke="#6a9985" strokeWidth="2" strokeDasharray={kind==='blink'?'4 7':undefined}/>{kind==='blink'?<>{note(42,65,'C4')}<g opacity=".25">{note(110,65,'E4')}</g>{note(178,65,'G4')}</>:note(162,62,'E4')}<text x="110" y="118" textAnchor="middle" fontSize="10" fill="#5f786b">{text(kind==='orbit'?'Orbit / Line':kind==='draw'?'A path drawn by you':'On · Off · On')}</text></>;
  else drawing=<><path d="M 43 83 L 104 39 L 174 79" fill="none" stroke="#9bbca9" strokeWidth="2"/>{note(43,83,'C4')}{note(104,39,'E4')}{note(174,79,'G4')}<text x="110" y="119" textAnchor="middle" fontSize="10" fill="#5f786b">{text('Double-click to add')}</text></>;
  return <svg viewBox="0 0 220 130" aria-hidden="true">{drawing}</svg>;
}
export function IllustratedGuide({scene,locale='en'}:{scene:OnboardingDemoId;locale?:'zh'|'en'}){
  const tips=locale==='zh'?TIPS_ZH:TIPS;
  return <figure className="onboarding-english-guide" data-scene={scene} data-ui-source="illustrated-guide" lang={locale==='zh'?'zh-CN':'en'}>
    {tips[scene].map((tip,i)=><section key={tip.art}><div className="onboarding-english-art"><GuideArt kind={tip.art} locale={locale}/></div><div className="onboarding-english-copy"><span>{String(i+1).padStart(2,'0')}</span><h3>{tip.title}</h3><p>{tip.body}</p></div></section>)}
  </figure>;
}
