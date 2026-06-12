import { useState, useEffect, useMemo, useRef, forwardRef } from "react";
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, arrayUnion, runTransaction } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import {
  Calendar, CalendarDays, Clock, Users, Monitor, Video, Plus, X, Check,
  CheckCircle2, Repeat, AlertCircle, ChevronLeft, ChevronRight, Trash2,
  Building2, List, LogOut, Lock, User, UserPlus, GripVertical, LogIn,
  LayoutDashboard, HelpCircle, Sun, Moon, Download, FileText,
} from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/* ===================== design tokens ===================== */
const C = {
  ink: "var(--ink)", paper: "var(--paper)", bg: "var(--bg)",
  yellow: "var(--yellow)", yellowDeep: "var(--yellow-deep)", yellowSoft: "var(--yellow-soft)",
  border: "var(--border)", line: "var(--line)", text: "var(--text)", muted: "var(--muted)", faint: "var(--faint)",
};
const PASTEL = {
  gray:   { bg: "var(--pastel-gray-bg)", text: "var(--pastel-gray-text)", dot: "var(--pastel-gray-dot)", line: "var(--pastel-gray-line)" },
  brown:  { bg: "var(--pastel-brown-bg)", text: "var(--pastel-brown-text)", dot: "var(--pastel-brown-dot)", line: "var(--pastel-brown-line)" },
  orange: { bg: "var(--pastel-orange-bg)", text: "var(--pastel-orange-text)", dot: "var(--pastel-orange-dot)", line: "var(--pastel-orange-line)" },
  yellow: { bg: "var(--pastel-yellow-bg)", text: "var(--pastel-yellow-text)", dot: "var(--pastel-yellow-dot)", line: "var(--pastel-yellow-line)" },
  green:  { bg: "var(--pastel-green-bg)", text: "var(--pastel-green-text)", dot: "var(--pastel-green-dot)", line: "var(--pastel-green-line)" },
  blue:   { bg: "var(--pastel-blue-bg)", text: "var(--pastel-blue-text)", dot: "var(--pastel-blue-dot)", line: "var(--pastel-blue-line)" },
  purple: { bg: "var(--pastel-purple-bg)", text: "var(--pastel-purple-text)", dot: "var(--pastel-purple-dot)", line: "var(--pastel-purple-line)" },
  pink:   { bg: "var(--pastel-pink-bg)", text: "var(--pastel-pink-text)", dot: "var(--pastel-pink-dot)", line: "var(--pastel-pink-line)" },
  red:    { bg: "var(--pastel-red-bg)", text: "var(--pastel-red-text)", dot: "var(--pastel-red-dot)", line: "var(--pastel-red-line)" },
};
const COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];
const pal = (c) => PASTEL[c] || PASTEL.yellow;

const EQUIP = { monitor: { label: "모니터", Icon: Monitor }, video: { label: "화상회의", Icon: Video } };
const ROOMS = [
  { id: "big",   name: "큰 회의실",   capacity: 8, equip: ["monitor", "video"] },
  { id: "small", name: "작은 회의실", capacity: 6, equip: ["monitor"] },
];

/* members — 성 제외, 표시는 "{name}님" */
const MEMBERS = [
  { id: "m15", name: "보아", team: "VD", role: "디렉터", group: "director" },
  { id: "m1",  name: "규호", team: "ID", role: "디렉터", group: "director" },
  { id: "m5",  name: "준구", team: "ID", role: "디렉터", group: "director" },
  { id: "m8",  name: "유진", team: "ID", role: "시니어 디자이너",   group: "staff" },
  { id: "m10", name: "현열", team: "ID", role: "시니어 디자이너",   group: "staff" },
  { id: "m2",  name: "진우", team: "ID", role: "디자이너",         group: "staff" },
  { id: "m3",  name: "다은", team: "ID", role: "디자이너",         group: "staff" },
  { id: "m6",  name: "태영", team: "ID", role: "디자이너",         group: "staff" },
  { id: "m7",  name: "경선", team: "ID", role: "디자이너",         group: "staff" },
  { id: "m9",  name: "준범", team: "ID", role: "프리랜서 디자이너", group: "staff" },
  { id: "m11", name: "수현", team: "VD", role: "디자이너",         group: "staff" },
  { id: "m12", name: "혜경", team: "VD", role: "디자이너",         group: "staff" },
  { id: "m13", name: "지민", team: "VD", role: "디자이너",         group: "staff" },
  { id: "m4",  name: "도영", team: "VD", role: "인턴",            group: "staff" },
  { id: "m14", name: "정수", team: "ID", role: "인턴",            group: "staff" },
];
const M = (id) => MEMBERS.find((x) => x.id === id);
const memLabel = (id) => { const m = M(id); return m ? `${m.team} ${m.name}님` : id; };

/* timeline geometry */
const DAY_START = 9 * 60, DAY_END = 22 * 60, STEP = 10, PX = 30;
const SLOTS = (DAY_END - DAY_START) / STEP, GUTTER = 48;

/* helpers */
const pad = (n) => String(n).padStart(2, "0");
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const toHHMM = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtK = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) => keyOf(a) === keyOf(b);
const TIMES = Array.from({ length: SLOTS + 1 }, (_, i) => toHHMM(DAY_START + i * STEP));
const nid = () => `r_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;


const VAPID_PUBLIC_KEY = "BPEVBSwDakUuwkdE60FOGy3YcdASPrlcC43xsnxkLhc_KNMrhEmYi0-x94IBEvb-d4SXWfouYdAdKwgDokH9BnA";

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeToWebPush(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    await navigator.serviceWorker.register('/service-worker.js');
    
    // Wait until the service worker is active and ready
    const registration = await navigator.serviceWorker.ready;
    
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
      // Save subscription to user document in Firestore
      if (isFirebaseConfigured) {
        await setDoc(doc(db, "users", userId), { 
          id: userId, 
          webPushSubscriptions: arrayUnion(JSON.parse(JSON.stringify(subscription))) 
        }, { merge: true });
      }
    }
  } catch (err) {
    console.error('Web Push subscription error:', err);
  }
}

async function sendPushNotification(title, body, attendees) {
  try {
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, url: '/', attendees })
    });
  } catch (err) {
    console.error('Failed to send push notification:', err);
  }
}

/* ===================== shared atoms ===================== */
function TeamTag({ team }) {
  const id = team === "ID";
  return <span className="inline-grid h-[18px] min-w-[24px] place-items-center rounded-[3px] px-1 text-[10px] font-medium" style={id ? { background: PASTEL.gray.bg, color: PASTEL.gray.text } : { background: PASTEL.brown.bg, color: PASTEL.brown.text }}>{team}</span>;
}
function EquipChip({ type }) {
  const e = EQUIP[type]; if (!e) return null; const { Icon } = e;
  return <span className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium" style={{ background: "var(--bg-chip)", color: C.muted }}><Icon size={12} /> {e.label}</span>;
}
function StatusPill({ kind, text }) {
  const m = { busy: { bg: PASTEL.red.bg, fg: PASTEL.red.text, dot: PASTEL.red.dot }, soon: { bg: PASTEL.gray.bg, fg: PASTEL.gray.text, dot: PASTEL.gray.dot }, free: { bg: PASTEL.green.bg, fg: PASTEL.green.text, dot: PASTEL.green.dot } }[kind];
  return <span className="inline-flex items-center gap-1.5 rounded-[4px] px-2 py-0.5 text-[11px] font-medium" style={{ background: m.bg, color: m.fg }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: m.dot }} /> {text}</span>;
}
function Wordmark({ size = 18 }) {
  return <span className="tracking-tight" style={{ fontSize: size, color: C.ink, lineHeight: 1 }}><span style={{ fontWeight: 500, color: C.text }}>found</span><span style={{ fontWeight: 600 }}>founded</span></span>;
}
const defaultProfiles = {
  "도영": "/avatar_doyoung.png",
  "혜경": "/avatar_hyekyung.png",
  "지민": "/avatar_jimin.png",
  "수현": "/avatar_suhyun.png",
  "보아": "/avatar_boa.png",
  "oxo": "/avatar_oxo.png",
  "진우": "/avatar_jinwoo.png",
  "다은": "/avatar_daeun.png",
  "태영": "/avatar_taeyoung.png",
  "경선": "/avatar_kyungsun.png",
  "유진": "/avatar_yujin.png",
  "준범": "/avatar_junbeom.png",
  "현열": "/avatar_hyunyeol.png",
  "정수": "/avatar_jungsoo.png",
  "준구": "/avatar_jungoo.png",
  "규호": "/avatar_gyuho.png"
};

function Avatar({ name, label, size = 36, solid = false, onClick, className, style }) {
  const [img, setImg] = useState(null);
  
  useEffect(() => {
    const loadImg = () => {
      try {
        const x = localStorage.getItem("profile_images");
        const p = x ? JSON.parse(x) : {};
        setImg(name ? (p[name] || defaultProfiles[name]) : null);
      } catch {
        setImg(name ? defaultProfiles[name] : null);
      }
    };
    loadImg();
    const handler = () => loadImg();
    window.addEventListener("profile_updated", handler);
    return () => window.removeEventListener("profile_updated", handler);
  }, [name]);

  if (img) {
    return (
      <img 
        src={img} 
        alt={name} 
        onClick={onClick}
        className={`shrink-0 rounded-full object-cover ${className || ""}`} 
        style={{ width: size, height: size, border: `1px solid ${C.border}`, cursor: onClick ? "pointer" : "default", ...style }} 
      />
    );
  }
  
  const lbl = label || (name ? name.slice(0, 2) : "");
  return (
    <span 
      onClick={onClick}
      className={`grid shrink-0 place-items-center rounded-full font-medium ${className || ""}`} 
      style={{ 
        width: size, 
        height: size, 
        fontSize: size * 0.36, 
        background: solid ? "var(--bg-avatar)" : "var(--bg-input)", 
        border: `1px solid ${C.border}`, 
        color: C.muted,
        cursor: onClick ? "pointer" : "default",
        ...style 
      }}
    >
      {lbl}
    </span>
  );
}

/* ===================== login modal ===================== */
function LoginModal({ message, onClose, onLogin }) {
  const [name, setName] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState("");
  const submit = () => { 
    const trimmedName = name.trim();
    if (!trimmedName) return setErr("이름을 입력해주세요."); 
    const memberExists = MEMBERS.some((m) => m.name === trimmedName);
    if (!memberExists) return setErr("등록되지 않은 멤버 이름입니다. 등록된 이름으로 로그인해 주세요.");
    if (pw !== "3377") return setErr("비밀번호가 올바르지 않아요."); 
    onLogin(trimmedName); 
  };
  return (
    <div className="ov fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4" style={{ background: "rgba(20,20,20,.5)" }} onClick={onClose}>
      <div className="sheet w-full rounded-t-lg bg-white p-6 sm:max-w-sm sm:rounded-lg" style={{ boxShadow: "0 -4px 12px rgba(0,0,0,.08)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><Wordmark size={20} /><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg" style={{ color: C.faint }}><X size={18} /></button></div>
        <p className="mt-4 text-[15px] font-medium">{message}</p>
        <p className="mt-1 text-[12px]" style={{ color: C.faint }}>이름과 비밀번호를 입력해 로그인하세요.</p>
        <div className="mt-4 flex items-center gap-2 rounded-lg border px-3" style={{ borderColor: C.border }}>
          <User size={16} style={{ color: C.faint }} />
          <input className="inp w-full bg-transparent py-2.5 text-sm outline-none" value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="이름 (예: 태영)" autoFocus />
        </div>
        <div className="mt-2.5 flex items-center gap-2 rounded-lg border px-3" style={{ borderColor: C.border }}>
          <Lock size={16} style={{ color: C.faint }} />
          <input type="password" className="inp w-full bg-transparent py-2.5 text-sm outline-none" value={pw} onChange={(e) => { setPw(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="비밀번호" />
        </div>
        {err && <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold" style={{ color: PASTEL.red.text }}><AlertCircle size={13} />{err}</div>}
        <button onClick={submit} className="lift mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg py-3 text-sm font-medium" style={{ background: C.ink, color: "var(--bg)", boxShadow: "0 1px 2px rgba(0,0,0,.05)" }}><LogIn size={16} /> 로그인</button>
      </div>
    </div>
  );
}


/* ===================== dashboard ===================== */
function lcg(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function genDash(year, month, roomFilter, reservations) {
  const days = new Date(year, month + 1, 0).getDate();
  const daily = [];
  let big = 0, small = 0;
  
  for (let d = 1; d <= days; d++) {
    daily.push({ d, wd: new Date(year, month, d).getDay(), big: 0, small: 0, total: 0 });
  }

  if (Array.isArray(reservations)) {
    reservations.forEach(r => {
      const [ry, rm, rd] = r.date.split("-").map(Number);
      if (ry === year && rm === month + 1) {
        if (roomFilter === "all" || r.roomId === roomFilter) {
          const dObj = daily[rd - 1];
          if (dObj) {
            const durationMin = toMin(r.end) - toMin(r.start);
            const durationHours = durationMin / 60;
            if (r.roomId === "big") {
              dObj.big += 1;
              big += durationHours;
            } else if (r.roomId === "small") {
              dObj.small += 1;
              small += durationHours;
            }
            dObj.total += 1;
          }
        }
      }
    });
  }

  const total = daily.reduce((acc, curr) => acc + curr.total, 0);
  const totalHours = Math.round(big + small);
  const mostUsed = big > small ? "큰 회의실" : small > big ? "작은 회의실" : "-";
  const leastUsed = big > small ? "작은 회의실" : small > big ? "큰 회의실" : "-";
  return { 
    days, 
    daily, 
    total, 
    totalHours, 
    mostUsed, 
    leastUsed, 
    mostHours: Math.round(big), 
    leastHours: Math.round(small)
  };
}
const HEAT = ["var(--heat-0)", "var(--heat-1)", "var(--heat-2)", "var(--heat-3)", "var(--heat-4)"];
function heatColor(v, max) { if (!v) return HEAT[0]; const lv = Math.min(4, 1 + Math.floor((v / Math.max(1, max)) * 3.99)); return HEAT[lv]; }

function StatCard({ label, value, sub, delay }) {
  return (
    <div className="rise rounded-lg border bg-white p-4" style={{ borderColor: C.border, animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: C.muted }}>{label}<HelpCircle size={12} style={{ color: C.faint }} /></div>
      {sub && <div className="mt-3 text-[11px] font-medium" style={{ color: C.faint }}>{sub}</div>}
      <div className={`${sub ? "mt-0.5" : "mt-4"} text-[22px] font-medium tracking-tight`}>{value}</div>
    </div>
  );
}

function Dashboard({ month, setMonth, roomF, setRoomF, now, reservations }) {
  const data = useMemo(() => genDash(month.getFullYear(), month.getMonth(), roomF, reservations), [month, roomF, reservations]);
  const maxTotal = Math.max(1, ...data.daily.map((x) => x.total));
  // heatmap grid
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = addDays(first, -first.getDay());
  const heatCells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const dailyByDate = {}; data.daily.forEach((x) => { dailyByDate[x.d] = x; });

  // bar chart geometry
  const barW = 22, gap = 8, chartH = 170, padB = 22, padT = 8;
  const innerW = data.days * barW + (data.days - 1) * gap;
  const scale = (chartH - padB - padT) / maxTotal;

  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-medium">회의실 현황 대시보드</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border bg-white" style={{ borderColor: C.border }}>
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="lift grid h-9 w-9 place-items-center rounded-l-xl" style={{ color: C.muted }}><ChevronLeft size={17} /></button>
            <div className="px-2 text-sm font-medium">{month.getFullYear()}년 {month.getMonth() + 1}월</div>
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="lift grid h-9 w-9 place-items-center rounded-r-xl" style={{ color: C.muted }}><ChevronRight size={17} /></button>
          </div>
          <div className="inline-flex rounded-lg border bg-white p-1" style={{ borderColor: C.border }}>
            {[["all", "전체"], ["big", "큰 회의실"], ["small", "작은 회의실"]].map(([k, l]) => (
              <button key={k} onClick={() => setRoomF(k)} className="rounded-lg px-3 py-1.5 text-xs font-medium" style={roomF === k ? { background: C.ink, color: "var(--bg)" } : { color: C.muted }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="총 회의실 예약 수" value={`${data.total}건`} delay={0} />
        <StatCard label="총 회의실 사용 시간" value={`${data.totalHours}시간`} delay={40} />
        <StatCard label="가장 많이 사용된 회의실" sub={`${data.mostHours}시간`} value={data.mostUsed} delay={80} />
        <StatCard label="가장 적게 사용된 회의실" sub={`${data.leastHours}시간`} value={data.leastUsed} delay={120} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* heatmap */}
        <div className="rise rounded-lg border bg-white p-5" style={{ borderColor: C.border, animationDelay: "120ms" }}>
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-lg px-2 py-0.5 text-xs font-medium" style={{ background: PASTEL.yellow.bg, color: PASTEL.yellow.text }}>{month.getMonth() + 1}월</span>
            <span className="text-sm font-medium">회의실 이용 현황</span>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEK.map((w, i) => <div key={w} className="text-center text-[10px] font-medium" style={{ color: i === 0 ? "#C0392B" : i === 6 ? "#2A5DC7" : C.faint }}>{w}</div>)}
            {heatCells.map((c, i) => {
              const inM = c.getMonth() === month.getMonth();
              const v = inM ? (dailyByDate[c.getDate()]?.total || 0) : 0;
              return (
                <div
                  key={i}
                  className="aspect-square rounded-lg flex flex-col justify-between p-1.5 text-center transition-all"
                  title={inM ? `${c.getDate()}일 · ${v}건` : ""}
                  style={{
                    background: inM ? (v > 0 ? "var(--bg-quaternary)" : "var(--bg-secondary)") : "transparent",
                    border: inM ? `1px solid ${C.line}` : "none",
                    minHeight: "48px"
                  }}
                >
                  {inM ? (
                    <>
                      <span className="text-[10px] font-semibold block text-left" style={{ color: C.muted }}>{c.getDate()}</span>
                      <span className="text-[12px] font-bold block" style={{ color: v > 0 ? "var(--ink)" : "var(--faint)", opacity: v > 0 ? 1 : 0.4 }}>
                        {v > 0 ? `${v}건` : "-"}
                      </span>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-[11px]" style={{ color: C.faint }}>
            * 각 날짜별 칸에 내가 포함된 예약의 총 건수가 숫자로 표시됩니다.
          </div>
        </div>

        {/* bar chart */}
        <div className="rise rounded-lg border bg-white p-5" style={{ borderColor: C.border, animationDelay: "160ms" }}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded-lg px-2 py-0.5 text-xs font-medium" style={{ background: PASTEL.blue.bg, color: PASTEL.blue.text }}>{month.getMonth() + 1}월</span>
              <span className="text-sm font-medium">일별 회의 현황</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-semibold" style={{ color: C.muted }}>
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--ink-deep)" }} />큰</span>
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--yellow-deep)" }} />작은</span>
            </div>
          </div>
          <div className="sc overflow-x-auto">
            <svg width={Math.max(innerW + 8, 320)} height={chartH} style={{ display: "block" }}>
              {[0, 0.5, 1].map((t, i) => { const y = padT + (chartH - padB - padT) * (1 - t); return <g key={i}><line x1="0" x2={innerW + 8} y1={y} y2={y} stroke={C.line} strokeWidth="1" /><text x="0" y={y - 3} fontSize="9" fill={C.faint}>{Math.round(maxTotal * t)}</text></g>; })}
              {data.daily.map((x, i) => {
                const xx = i * (barW + gap);
                const sH = x.small * scale, bH = x.big * scale;
                const baseY = chartH - padB;
                return (
                  <g key={i}>
                    <rect x={xx} y={baseY - sH} width={barW} height={sH} fill="var(--yellow-deep)" rx="2" />
                    <rect x={xx} y={baseY - sH - bH} width={barW} height={bH} fill="var(--ink-deep)" rx="2" />
                    {(x.d % 5 === 1) && <text x={xx + barW / 2} y={chartH - 6} fontSize="9" fill={C.faint} textAnchor="middle">{x.d}</text>}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
      <p className="mt-3 text-[11px]" style={{ color: C.faint }}>* 대시보드 지표는 해당 월의 이용 현황을 집계해 보여줍니다.</p>
    </section>
  );
}

/* ===================== app ===================== */
export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const tokenStr = localStorage.getItem("auth_token");
      if (tokenStr) {
        const token = JSON.parse(decodeURIComponent(escape(atob(tokenStr))));
        if (token.exp && token.exp > Date.now()) {
          return token.name;
        } else {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("last_user");
        }
      }
    } catch(e) {}
    return null;
  });

  useEffect(() => {
    if (user) {
      const meId = MEMBERS.find((m) => m.name === user)?.id;
      if (meId) {
        subscribeToWebPush(meId);
      }
    }
  }, [user]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 20000); return () => clearInterval(t); }, []);



  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const [section, setSection] = useState("book");
  const [view, setView] = useState("calendar");
  const [anchor, setAnchor] = useState(() => dayOnly(new Date()));
  const [mineDate, setMineDate] = useState(() => keyOf(new Date()));
  const [roomId, setRoomId] = useState("big");
  const [dashMonth, setDashMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [dashRoom, setDashRoom] = useState("all");
  const [reservations, setReservations] = useState(() => {
    if (!isFirebaseConfigured) {
      try {
        const local = localStorage.getItem("reservations");
        return local ? JSON.parse(local) : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsub = onSnapshot(collection(db, "reservations"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setReservations(data);
    });
    return () => unsub();
  }, []);

  // Trigger ending notifications
  useEffect(() => {
    if (!isFirebaseConfigured || reservations.length === 0 || !user) return;
    const todayKey = keyOf(new Date());
    const nowM = now.getHours() * 60 + now.getMinutes();

    reservations.forEach(async (r) => {
      if (r.date !== todayKey || !r.start || !r.end) return;
      const endM = toMin(r.end);
      const startM = toMin(r.start);
      if (nowM < startM || nowM >= endM) return; // Only process active meetings

      const left = endM - nowM;
      
      if (left === 5 && !r.notified5m) {
        try {
          await runTransaction(db, async (transaction) => {
            const sfDocRef = doc(db, "reservations", r.id);
            const sfDoc = await transaction.get(sfDocRef);
            if (!sfDoc.exists() || sfDoc.data().notified5m) throw "Already notified";
            transaction.update(sfDocRef, { notified5m: true });
          });
          const roomName = ROOMS.find(rm => rm.id === r.roomId)?.name || r.roomId;
          sendPushNotification('⏳ 회의 종료 5분 전입니다', `[${roomName}] 다음 회의나 마무리를 준비해주세요.`, r.attendees);
        } catch(e) {}
      }
      
      if (left === 1 && !r.notified1m) {
        try {
          await runTransaction(db, async (transaction) => {
            const sfDocRef = doc(db, "reservations", r.id);
            const sfDoc = await transaction.get(sfDocRef);
            if (!sfDoc.exists() || sfDoc.data().notified1m) throw "Already notified";
            transaction.update(sfDocRef, { notified1m: true });
          });
          const roomName = ROOMS.find(rm => rm.id === r.roomId)?.name || r.roomId;
          sendPushNotification('⏱️ 회의 종료 1분 전입니다', `[${roomName}] 곧 회의실 이용 시간이 끝납니다.`, r.attendees);
        } catch(e) {}
      }
    });
  }, [now, reservations, user]);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const localRes = localStorage.getItem("reservations");
    const migrated = localStorage.getItem("firestore_migrated");
    if (localRes && !migrated) {
      try {
        const parsed = JSON.parse(localRes);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach(async (r) => {
            if (r.id) {
              await setDoc(doc(db, "reservations", r.id), r);
            }
          });
        }
        localStorage.setItem("firestore_migrated", "true");
      } catch (err) {
        console.error("Local data migration error:", err);
      }
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      localStorage.setItem("reservations", JSON.stringify(reservations));
    }
  }, [reservations]);

  const isMigratedRef = useRef(false);
  useEffect(() => {
    if (!isFirebaseConfigured && reservations.length > 0 && !isMigratedRef.current) {
      const seenIds = new Set();
      let hasDuplicates = false;
      const updated = reservations.map((r) => {
        if (!r.id || seenIds.has(r.id)) {
          hasDuplicates = true;
          return { ...r, id: nid() };
        }
        seenIds.add(r.id);
        return r;
      });

      if (hasDuplicates) {
        isMigratedRef.current = true;
        // eslint-disable-next-line
        setReservations(updated);
        showToast("중복 등록된 예약을 안전하게 개별 분리하여 복구했습니다.");
      }
    }
  }, [reservations]);

  const [form, setForm] = useState(null);
  const [errs, setErrs] = useState({});
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [temp, setTemp] = useState([]);
  const [dz, setDz] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMsg, setAuthMsg] = useState("");
  const [authPending, setAuthPending] = useState(null);
  
  // PWA & iOS install banner
  const [showIosBanner, setShowIosBanner] = useState(false);
  useEffect(() => {
    const isIos = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      return /iphone|ipad|ipod/.test(userAgent);
    };
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isIos() && !isStandalone) {
      setShowIosBanner(true);
    }
  }, []);

const [dayEventsDate, setDayEventsDate] = useState(null);

  useEffect(() => {
    const handleMessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'EXPO_PUSH_TOKEN' && isFirebaseConfigured) {
          const u = localStorage.getItem("last_user"); // Need to save last_user on login
          const meId = MEMBERS.find((m) => m.name === u)?.id;
          if (meId) {
             await setDoc(doc(db, "users", meId), { id: meId, expoPushToken: data.token }, { merge: true });
          }
        }
      } catch (e) {}
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 120;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        const updated = { ...profiles, [user]: dataUrl };
        setProfiles(updated);
        localStorage.setItem("profile_images", JSON.stringify(updated));
        window.dispatchEvent(new CustomEvent("profile_updated"));
        showToast("프로필 이미지를 등록했습니다.");
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteProfileImage = () => {
    const updated = { ...profiles };
    delete updated[user];
    setProfiles(updated);
    localStorage.setItem("profile_images", JSON.stringify(updated));
    setShowProfileMenu(false);
    window.dispatchEvent(new CustomEvent("profile_updated"));
    showToast("프로필 이미지를 삭제했습니다.");
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profiles, setProfiles] = useState(() => {
    try {
      const x = localStorage.getItem("profile_images");
      const saved = x ? JSON.parse(x) : {};
      return { ...defaultProfiles, ...saved };
    } catch { 
      return defaultProfiles; 
    }
  });
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const fileInputRef = useRef(null);
  
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef(null);
  const [exportMode, setExportMode] = useState("week");

  const handleExportPDF = async (mode) => {
    if (isExporting) return;
    setExportMode(mode);
    setIsExporting(true);
    showToast("PDF 리포트를 생성하고 있습니다. 잠시만 기다려 주세요...");

    setTimeout(async () => {
      const element = reportRef.current;
      if (!element) {
        showToast("에러: 출력 대상을 찾을 수 없습니다.");
        setIsExporting(false);
        return;
      }

      try {
        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        const imgWidth = 210;
        const pageHeight = 297;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        const pdf = new jsPDF("p", "mm", "a4");
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }

        const rangeStr = mode === "week" ? "주간" : "월간";
        pdf.save(`${user}_회의실_사용내역_${rangeStr}.pdf`);
        showToast("PDF 리포트를 성공적으로 다운로드했습니다!");
      } catch (err) {
        console.error(err);
        showToast("PDF 생성 중 오류가 발생했습니다.");
      } finally {
        setIsExporting(false);
      }
    }, 800); // 렌더링 대기
  };

  const timelineScrollRef = useRef(null);

  useEffect(() => {
    if (view === "timeline" && section === "book" && timelineScrollRef.current) {
      const timer = setTimeout(() => {
        const today = new Date();
        const currentHourMin = today.getHours() * 60;
        if (sameDay(anchor, today)) {
          if (currentHourMin >= DAY_START && currentHourMin <= DAY_END) {
            const minutesFromStart = currentHourMin - DAY_START;
            const pixelOffset = minutesFromStart * (PX / STEP);
            timelineScrollRef.current.scrollTop = Math.max(0, pixelOffset);
          } else if (today.getHours() * 60 + today.getMinutes() > DAY_END) {
            timelineScrollRef.current.scrollTop = timelineScrollRef.current.scrollHeight;
          } else {
            timelineScrollRef.current.scrollTop = 0;
          }
        } else {
          timelineScrollRef.current.scrollTop = 0;
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [view, roomId, section, anchor]);

  const today = dayOnly(now);
  const selKey = keyOf(anchor);
  const isToday = sameDay(anchor, today);
  const isCurMonth = anchor.getFullYear() === today.getFullYear() && anchor.getMonth() === today.getMonth();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const room = ROOMS.find((r) => r.id === roomId);

  const getMeId = () => { const u = user; const m = MEMBERS.find((x) => u && (x.name.includes(u) || u.includes(x.name))); return m ? m.id : null; };
  const isMine = (r) => !!user && r.owner === user;
  const canEdit = (r) => {
    if (!user) return false;
    if (r.owner === user) return true;
    const meId = MEMBERS.find((m) => m.name === user)?.id;
    return !!(meId && r.attendees && r.attendees.includes(meId));
  };
  const canDelete = (r) => {
    return !!user && r.owner === user;
  };
  function showToast(m) { setToast(m); setTimeout(() => setToast(null), 2600); }

  function requireAuth(fn, msg) { if (user) return fn(); setAuthMsg(msg || "계속하려면 로그인이 필요해요."); setAuthPending(() => fn); setAuthOpen(true); }
      function doLogin(name) { 
    setReservations((p) => p.map((r) => (r.owner === "나" ? { ...r, owner: name } : r))); 
    setUser(name); 
    localStorage.setItem("last_user", name);
    const token = { name: name, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 };
    localStorage.setItem("auth_token", btoa(unescape(encodeURIComponent(JSON.stringify(token)))));
    setAuthOpen(false); 
    const meId = MEMBERS.find((m) => m.name === name)?.id;
    if (meId) {
      subscribeToWebPush(meId);
    }
  }
  useEffect(() => { if (user && authPending) { const p = authPending; setAuthPending(null); p(); } }, [user]); // eslint-disable-line

  const myRes = useMemo(() => {
    if (!user) return [];
    const meId = MEMBERS.find((m) => m.name === user)?.id;
    return reservations.filter((r) => {
      return meId && r.attendees && r.attendees.includes(meId) && r.date === mineDate;
    }).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  }, [reservations, user, mineDate]);

  const myResAll = useMemo(() => {
    if (!user) return [];
    const meId = MEMBERS.find((m) => m.name === user)?.id;
    return reservations.filter((r) => {
      return meId && r.attendees && r.attendees.includes(meId);
    }).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  }, [reservations, user]);

  const byDate = useMemo(() => { const m = {}; reservations.forEach((r) => { (m[r.date] ||= []).push(r); }); return m; }, [reservations]);

  function roomStatus(rid) {
    const list = reservations.filter((r) => r.roomId === rid && r.date === selKey);
    if (isToday) {
      const cur = list.find((r) => toMin(r.start) <= nowMin && nowMin < toMin(r.end));
      if (cur) return { kind: "busy", text: `사용 중 · ~${cur.end}`, count: list.length };
      const next = list.filter((r) => toMin(r.start) > nowMin).sort((a, b) => toMin(a.start) - toMin(b.start))[0];
      if (next) return { kind: "soon", text: `다음 ${next.start}`, count: list.length };
      return { kind: "free", text: "사용 가능", count: list.length };
    }
    return { kind: list.length ? "soon" : "free", text: list.length ? `예약 ${list.length}건` : "사용 가능", count: list.length };
  }
  function overlaps(rid, date, s, e, ignore) {
    const a = toMin(s), b = toMin(e);
    return reservations.some((r) => r.roomId === rid && r.date === date && r.id !== ignore && !(b <= toMin(r.start) || a >= toMin(r.end)));
  }
  const defStart = () => Math.min(Math.max(isToday ? Math.ceil(nowMin / STEP) * STEP : 10 * 60, DAY_START), DAY_END - 60);
  function openCreate(rid, startMin, date) { setErrs({}); const me = getMeId(); setForm({ id: null, roomId: rid, title: "", date: date || selKey, start: toHHMM(startMin), end: toHHMM(Math.min(startMin + 60, DAY_END)), attendees: me ? [me] : [], repeat: false, color: "yellow", isUrgent: false, comments: [] }); }
  const tryCreate = (rid, sm, date) => requireAuth(() => openCreate(rid, sm, date), "일정을 추가하려면 로그인이 필요해요.");
  const openEdit = (r) => { setErrs({}); setForm({ ...r, attendees: [...r.attendees] }); };

    async function saveForm() {
    if (isSubmitting) return;
    const f = form; const e = {};
    if (!f.title.trim()) e.title = "회의 제목을 입력해주세요.";
    if (toMin(f.end) <= toMin(f.start)) e.time = "종료 시간은 시작 시간보다 늦어야 해요.";
    if (f.attendees.length === 0) e.att = "참석자를 1명 이상 선택해주세요.";
    if (f.attendees.length > ROOMS.find((r) => r.id === f.roomId).capacity) e.att = "참석 인원이 회의실 정원을 초과했어요.";
    setErrs(e);
    if (Object.keys(e).length) return;

    const startM = toMin(f.start);
    const endM = toMin(f.end);
    let pushedReservations = [];

    // Check for room overlaps
    const roomOverlaps = reservations.filter((r) => r.roomId === f.roomId && r.date === f.date && r.id !== f.id && !(endM <= toMin(r.start) || startM >= toMin(r.end)));
    
    if (roomOverlaps.length > 0) {
      if (!f.isUrgent) {
        setErrs({ ...e, time: "선택한 시간에 이미 다른 예약이 있어요. (긴급 회의로 설정하면 기존 예약을 미룰 수 있습니다)" });
        return;
      } else {
        // Pushing existing normal meetings
        const hasUrgentOverlap = roomOverlaps.some(r => r.isUrgent);
        if (hasUrgentOverlap) {
          setErrs({ ...e, time: "선택한 시간에 이미 다른 긴급 회의가 있어서 밀어낼 수 없습니다." });
          return;
        }
        
        // Push logic: move them right after this meeting
        let currentPushTime = endM;
        const sortedOverlaps = roomOverlaps.sort((a, b) => toMin(a.start) - toMin(b.start));
        
        for (const overlap of sortedOverlaps) {
          const duration = toMin(overlap.end) - toMin(overlap.start);
          const pushedStart = currentPushTime;
          const pushedEnd = pushedStart + duration;
          
          if (pushedEnd > DAY_END) {
             setErrs({ ...e, time: "기존 예약을 밀어내면 운영 시간(22:00)을 초과하게 됩니다." });
             return;
          }
          
          pushedReservations.push({
            ...overlap,
            start: toHHMM(pushedStart),
            end: toHHMM(pushedEnd)
          });
          currentPushTime = pushedEnd;
        }
      }
    }

    const conflicts = [];
    reservations.forEach((r) => {
      if (r.id !== f.id && r.date === f.date) {
        if (!(endM <= toMin(r.start) || startM >= toMin(r.end))) {
          f.attendees.forEach((attId) => {
            if (r.attendees && r.attendees.includes(attId)) {
              const mName = MEMBERS.find((m) => m.id === attId)?.name || attId;
              const rRoomName = ROOMS.find((rm) => rm.id === r.roomId)?.name || r.roomId;
              conflicts.push(`${mName}님 (${rRoomName} / ${r.start}~${r.end} "${r.title}")`);
            }
          });
        }
      }
    });

    if (conflicts.length > 0) {
      alert(`선택하신 참석자 중 해당 시간에 이미 다른 회의가 예약되어 있는 멤버가 있습니다:\n\n${conflicts.join("\n")}\n\n시간을 변경하거나 참석자 조정을 해주세요.`);
      return;
    }
    
    setIsSubmitting(true);
    try {
      const isEdit = !!f.id;
      const docId = f.id || nid();
      const finalForm = { ...f, id: docId, title: f.title.trim(), owner: f.owner || user };
      
      if (isFirebaseConfigured) {
        await setDoc(doc(db, "reservations", docId), finalForm);
        for (const pushed of pushedReservations) {
          await updateDoc(doc(db, "reservations", pushed.id), { start: pushed.start, end: pushed.end });
        }
      } else {
        setReservations((prev) => {
          let updated = [...prev];
          if (isEdit) {
            updated = updated.map(r => r.id === docId ? finalForm : r);
          } else {
            updated.push(finalForm);
          }
          pushedReservations.forEach(pushed => {
            updated = updated.map(r => r.id === pushed.id ? pushed : r);
          });
          return updated;
        });
      }
      
      showToast(isEdit ? "예약을 수정했어요." : "예약이 완료됐어요.");
      
      // Push Notifications
      if (!isEdit) {
         sendPushNotification('📅 새 회의가 등록됐어요', `[${ROOMS.find(r=>r.id===f.roomId)?.name}] ${f.date} ${f.start}~${f.end}`, f.attendees);
      } else {
         sendPushNotification('✏️ 회의 일정이 변경됐어요', `[${ROOMS.find(r=>r.id===f.roomId)?.name}] 일정이 바뀌었어요. 확인해주세요.`, f.attendees);
      }
      
      pushedReservations.forEach(pushed => {
         sendPushNotification('✏️ 긴급 회의로 일정이 밀렸어요', `[${ROOMS.find(r=>r.id===pushed.roomId)?.name}] 일정이 ${pushed.start}로 밀렸어요.`, pushed.attendees);
      });

      setForm(null);
    } catch (err) {
      console.error(err);
      showToast("오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }
  function cancelRes(id) { 
    const target = reservations.find((x) => x.id === id);
    if (target && !canDelete(target)) {
      showToast("예약 등록자 본인만 일정을 삭제할 수 있어요.");
      return;
    }
    requireAuth(async () => { 
      if (isFirebaseConfigured) {
        try {
          await deleteDoc(doc(db, "reservations", id));
          setForm(null); setDetail(null); showToast("예약을 삭제했어요."); 
        } catch (err) {
          console.error(err);
          showToast("오류가 발생했습니다.");
        }
      } else {
        setReservations((prev) => prev.filter((r) => r.id !== id));
        setForm(null); setDetail(null); showToast("예약을 삭제했어요.");
      }
    }, "일정을 삭제하려면 로그인이 필요해요."); 
  }

  function completeRes(r) {
    requireAuth(() => {
      if (r.date !== keyOf(today)) {
        showToast("오늘 일정만 즉시 완료할 수 있어요.");
        return;
      }
      const nowM = now.getHours() * 60 + now.getMinutes();
      const startM = toMin(r.start);
      const endM = toMin(r.end);
      if (nowM < startM) {
        showToast("아직 시작하지 않은 회의입니다.");
        return;
      }
      if (nowM >= endM) {
        showToast("이미 종료된 회의입니다.");
        return;
      }
      const newEnd = Math.max(startM + 10, Math.ceil(nowM / STEP) * STEP);
      
      if (isFirebaseConfigured) {
        updateDoc(doc(db, "reservations", r.id), { end: toHHMM(newEnd) }).then(() => {
          showToast("회의를 완료 처리했어요.");
        }).catch(err => {
          console.error(err);
          showToast("오류가 발생했습니다.");
        });
      } else {
        setReservations((prev) => prev.map((item) => item.id === r.id ? { ...item, end: toHHMM(newEnd) } : item));
        showToast("회의를 완료 처리했어요.");
      }
    }, "회의를 완료하려면 로그인이 필요해요.");
  }

    function extendRes(r, mins) {
    requireAuth(() => {
      const endM = toMin(r.end);
      const newEndM = endM + mins;
      if (newEndM > DAY_END) {
        showToast("운영 시간이 초과되어 연장할 수 없어요.");
        return;
      }
      
      const isOverlap = overlaps(r.roomId, r.date, toHHMM(endM), toHHMM(newEndM), r.id);
      if (isOverlap) {
         if(!window.confirm("⚠️ 이후 예약이 있습니다. 그래도 강제로 연장하시겠습니까? (다음 예약자에게 알림이 전송됩니다)")) {
            return;
         }
      }
      
      if (isFirebaseConfigured) {
        updateDoc(doc(db, "reservations", r.id), { end: toHHMM(newEndM) }).then(() => {
          showToast(`회의를 ${mins}분 연장했어요.`);
          if(isOverlap) {
             // Find overlapping meeting attendees
             const overlapsNext = reservations.filter(x => x.roomId === r.roomId && x.date === r.date && x.id !== r.id && !(toMin(x.end) <= endM || toMin(x.start) >= newEndM));
             overlapsNext.forEach(ov => {
               sendPushNotification('✏️ 회의 일정이 변경됐어요', `[${ROOMS.find(rm=>rm.id===ov.roomId)?.name}] 이전 회의 연장으로 인해 일정이 겹쳤습니다. 확인해주세요.`, ov.attendees);
             });
          }
        }).catch(err => {
          console.error(err);
          showToast("오류가 발생했습니다.");
        });
      } else {
        setReservations((prev) => prev.map((item) => item.id === r.id ? { ...item, end: toHHMM(newEndM) } : item));
        showToast(`회의를 ${mins}분 연장했어요.`);
      }
    }, "회의를 연장하려면 로그인이 필요해요.");
  }

  function openPicker() { setTemp([...(form.attendees || [])]); setPickerOpen(true); }
  const toggleTemp = (id) => setTemp((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const addTemp = (id) => setTemp((p) => (id && !p.includes(id) ? [...p, id] : p));
  function donePicker() { setForm((f) => ({ ...f, attendees: [...temp] })); setErrs((e) => ({ ...e, att: undefined })); setPickerOpen(false); }

  const onBlockClick = (r) => (canEdit(r) ? openEdit(r) : setDetail(r));

  /* ----- timeline renderers ----- */
  const Gutter = () => (
    <div className="relative shrink-0" style={{ width: GUTTER, height: SLOTS * PX }}>
      {Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => <div key={i} className="absolute -translate-y-1/2 text-[11px] font-semibold" style={{ top: i * (60 / STEP) * PX, color: C.faint }}>{pad(Math.floor(DAY_START / 60) + i)}</div>)}
    </div>
  );
  const Track = ({ rid }) => {
    const list = reservations.filter((r) => r.roomId === rid && r.date === selKey).sort((a, b) => toMin(a.start) - toMin(b.start));
    return (
      <div className="relative w-full" style={{ height: SLOTS * PX }}>
        {Array.from({ length: SLOTS }, (_, i) => {
          const sm = DAY_START + i * STEP;
          const isHour = sm % 60 === 0;
          const isHalf = sm % 30 === 0;
          return <div key={i} className="slot absolute left-0 right-0 border-t" style={{ top: i * PX, height: PX, borderColor: isHour ? "var(--border-calendar)" : isHalf ? "var(--border-calendar-half)" : "rgba(234, 233, 226, 0.25)" }} onClick={() => tryCreate(rid, sm)} />;
        })}
        {list.map((r) => {
                    const top = ((toMin(r.start) - DAY_START) / STEP) * PX, h = ((toMin(r.end) - toMin(r.start)) / STEP) * PX, p = r.isUrgent ? pal('red') : pal('green'), mine = isMine(r);
          return (
            <div key={r.id} className="blk absolute overflow-hidden rounded-lg border px-2.5 py-1.5" style={{ top: top + 2, height: h - 4, left: 5, right: 5, background: p.bg, borderColor: p.line, color: p.text }} onClick={() => onBlockClick(r)}>
              <div className="flex items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.dot }} /><span className="truncate text-[13px] font-medium">{r.title}</span>{r.repeat && <Repeat size={11} />}{mine && <span className="ml-auto rounded px-1 text-[10px] font-medium" style={{ background: "rgba(255,255,255,.7)", color: p.text }}>내 예약</span>}</div>
              {h > 34 && <div className="mt-0.5 truncate text-[11px] font-medium" style={{ opacity: .85 }}>{r.start} ~ {r.end} · {r.attendees.length}명</div>}
            </div>
          );
        })}
        {isToday && nowMin >= DAY_START && nowMin <= DAY_END && (
          <div className="pointer-events-none absolute left-0 right-0 z-10" style={{ top: ((nowMin - DAY_START) / STEP) * PX }}><div className="flex items-center"><span className="h-2 w-2 rounded-full" style={{ background: C.ink }} /><span className="h-px flex-1" style={{ background: C.ink }} /></div></div>
        )}
      </div>
    );
  };

  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = addDays(first, -first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const startOfWeek = addDays(anchor, -anchor.getDay());
  const weekCells = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek, i));

  const NAV = [["book", "예약", CalendarDays], ["mine", "내 예약", List], ["install", "앱 설치", Download]];

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh" }} className="w-full flex flex-col">
      <style>{`
        *{font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";box-sizing:border-box;}
        .lift{transition:background .1s ease;} .lift:hover{background:var(--lift-hover);} .lift:active{background:var(--lift-active);}
        .inp{transition:border-color .15s ease, box-shadow .15s ease;} .inp:focus{border-color:${C.ink};}
        .slot{transition:background .12s ease;cursor:pointer;} .slot:hover{background:var(--slot-hover);}
        .slot:hover::after{content:'+ 예약';position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:11px;font-weight:600;color:${C.muted};}
        .blk{transition:background .1s ease;cursor:pointer;} .blk:hover{filter: brightness(0.95);}
        .cell{transition:background .1s ease;cursor:pointer;} .cell:hover{background:var(--slot-hover);}
        .mrow{cursor:grab;transition:background .1s ease;} .mrow:active{cursor:grabbing;}
        .fade{animation:fade .15s ease both;} @keyframes fade{from{opacity:0;}to{opacity:1;}}
        .sheet{animation:sheet .15s ease both;} @keyframes sheet{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
        .ov{animation:ov .15s ease both;} @keyframes ov{from{opacity:0;}to{opacity:1;}}
        .rise{animation:rise .2s ease both;} @keyframes rise{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:none;}}
        .tdrop{animation:tdrop .15s ease both;} @keyframes tdrop{from{opacity:0;}to{opacity:1;}}
        .sc::-webkit-scrollbar{width:6px;height:6px;} .sc::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px;}
        input,select,button{font-family:inherit;} select{appearance:none;-webkit-appearance:none;}
        /* PDF exporting style overrides */
        .pdf-exporting {
          background: #ffffff !important;
          color: #1a1a1a !important;
          padding: 28px !important;
          border-color: #e5e7eb !important;
          box-shadow: none !important;
        }
        .pdf-exporting .pdf-hide {
          display: none !important;
        }
        .pdf-exporting .pdf-card {
          background: #ffffff !important;
          border: 1px solid #e5e7eb !important;
          color: #1f2937 !important;
          box-shadow: none !important;
        }
        .pdf-exporting .pdf-title {
          color: #0f172a !important;
        }
        .pdf-exporting .pdf-text-muted {
          color: #4b5563 !important;
        }
        .pdf-exporting .pdf-text-faint {
          color: #9ca3af !important;
        }
        .pdf-exporting .pdf-border {
          border-color: #e5e7eb !important;
        }
        .pdf-exporting .pdf-cell-active {
          background: #fef08a !important;
          border-color: #fde047 !important;
        }
        .pdf-exporting .pdf-cell-in {
          background: #ffffff !important;
          border-color: #e5e7eb !important;
        }
        .pdf-exporting .pdf-cell-out {
          background: #f3f4f6 !important;
          border-color: #e5e7eb !important;
          opacity: 0.3 !important;
        }
      `}</style>

      
      {showIosBanner && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex justify-between items-center z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.1)]">
          <div className="text-sm">
            <b>iOS 앱으로 설치</b><br/><span className="text-xs text-gray-500">Safari 공유 버튼 ➔ '홈 화면에 추가'</span>
          </div>
          <button onClick={() => setShowIosBanner(false)} className="text-gray-400 p-2"><X size={18}/></button>
        </div>
      )}

      {/* ===== Header ===== */}
      <header className="sticky top-0 z-30 border-b" style={{ background: "var(--bg-header)", borderColor: C.border, backdropFilter: "blur(10px)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-5">
          <button onClick={() => window.location.reload()} className="flex items-center"><Wordmark size={19} /></button>
          <nav className="hidden items-center gap-1 rounded-lg p-1 md:flex" style={{ background: "var(--bg-quaternary)" }}>
            {NAV.map(([k, lbl, Icon]) => (
              <button key={k} onClick={() => setSection(k)} className="lift flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium" style={section === k ? { background: C.ink, color: "var(--bg)" } : { color: C.muted }}><Icon size={15} />{lbl}{k === "mine" && myRes.length ? ` · ${myRes.length}` : ""}</button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden text-right leading-tight sm:block"><div className="text-[12px] font-medium">{fmtK(now)}</div><div className="text-[11px]" style={{ color: C.faint }}>{now.getHours() < 12 ? "오전" : "오후"} {pad(((now.getHours() + 11) % 12) + 1)}:{pad(now.getMinutes())}</div></div>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="lift grid h-9 w-9 place-items-center rounded-lg border transition-all duration-200 active:scale-90"
              style={{ borderColor: C.border, color: C.muted }}
              title={theme === "dark" ? "라이트 모드" : "다크 모드"}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            {user ? (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setSection("mypage")} 
                  className="lift flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-all hover:border-black dark:hover:border-white"
                  style={{ 
                    borderColor: section === "mypage" ? C.ink : C.border, 
                    background: section === "mypage" ? "var(--bg-quaternary)" : "transparent"
                  }}
                >
                  <Avatar name={user} size={24} solid={section === "mypage"} />
                  <span style={{ color: C.text }}>{user}님</span>
                </button>
                <button onClick={() => { setUser(null); localStorage.removeItem("auth_token"); localStorage.removeItem("last_user"); if (section === "mypage" || section === "dash") setSection("book"); }} title="로그아웃" className="lift grid h-9 w-9 place-items-center rounded-[4px] border" style={{ borderColor: C.border, color: C.muted }}><LogOut size={15} /></button>
              </div>
            ) : (
              <button onClick={() => requireAuth(() => {}, "로그인")} className="lift flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium" style={{ background: C.ink, color: "var(--bg)", boxShadow: "0 1px 2px rgba(0,0,0,.05)" }}><LogIn size={15} /> 로그인</button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-5 md:pb-10 flex-1 flex flex-col w-full">
        {section === "book" && (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg border bg-white" style={{ borderColor: C.border }}>
                  <button onClick={() => view === "calendar" ? setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1)) : setAnchor(addDays(anchor, -1))} className="lift grid h-9 w-9 place-items-center rounded-l-xl" style={{ color: C.muted }}><ChevronLeft size={18} /></button>
                  <div className="flex items-center gap-2 px-2.5 text-sm font-medium sm:px-3">{view === "calendar" ? <CalendarDays size={15} style={{ color: "var(--bg)" }} /> : <Calendar size={15} style={{ color: C.ink }} />}{view === "calendar" ? `${anchor.getFullYear()}년 ${anchor.getMonth() + 1}월` : fmtK(anchor)}</div>
                  <button onClick={() => view === "calendar" ? setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)) : setAnchor(addDays(anchor, 1))} className="lift grid h-9 w-9 place-items-center rounded-r-xl" style={{ color: C.muted }}><ChevronRight size={18} /></button>
                </div>
                {(view === "calendar" ? isCurMonth : isToday)
                  ? <span className="rounded-lg px-2.5 py-1 text-xs font-medium" style={{ background: C.ink, color: "var(--bg)" }}>{view === "calendar" ? "이번 달" : "오늘"}</span>
                  : <button onClick={() => setAnchor(today)} className="lift rounded-lg border px-3 py-2 text-xs font-medium" style={{ borderColor: C.border, background: "var(--bg-input)", color: C.muted }}>오늘</button>}
              </div>
              <div className="inline-flex rounded-lg border bg-white p-1" style={{ borderColor: C.border }}>
                {[["calendar", "월간", CalendarDays], ["week", "주간", Calendar], ["timeline", "타임라인", List]].map(([k, lbl, Icon]) => (
                  <button key={k} onClick={() => setView(k)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium" style={view === k ? { background: C.ink, color: "var(--bg)" } : { color: C.muted }}><Icon size={15} /><span className="hidden sm:inline">{lbl}</span></button>
                ))}
              </div>
            </div>

            {(view === "calendar" || view === "week") ? (
              <section className="rise rounded-lg border bg-white p-2.5 sm:p-4 flex-1 flex flex-col" style={{ borderColor: C.border, boxShadow: "0 1px 2px rgba(0,0,0,.04)" }}>
                <div className="mb-2 hidden items-center justify-end px-1 text-xs font-medium sm:flex" style={{ color: C.faint }}>날짜를 누르면 해당 날짜로 이동 · 색상은 예약 시 직접 지정</div>
                <div className="grid grid-cols-7 overflow-hidden rounded-lg border flex-1" style={{ borderColor: C.border, gridTemplateRows: view === "week" ? "auto 1fr" : "auto repeat(6, 1fr)" }}>
                  {WEEK.map((w, i) => <div key={w} className="border-b py-2 text-center text-[11px] font-medium sm:text-xs" style={{ borderColor: C.border, background: "var(--bg-secondary)", color: i === 0 ? "#C0392B" : i === 6 ? "#2A5DC7" : C.muted }}>{w}</div>)}
                  {(view === "week" ? weekCells : cells).map((cell, i) => {
                    const inMonth = cell.getMonth() === anchor.getMonth(), cToday = sameDay(cell, today);
                    const list = (byDate[keyOf(cell)] || []).slice().sort((a, b) => toMin(a.start) - toMin(b.start));
                    return (
                      <div key={i} onClick={() => { if (list.length > 0) { setDayEventsDate(cell); } else { tryCreate(roomId, defStart(), keyOf(cell)); } }} className="cell border-b border-l p-1 sm:p-1.5 flex flex-col" style={{ borderColor: C.border, background: cToday ? C.yellowSoft : inMonth ? "var(--bg-input)" : "var(--bg-tertiary)", opacity: inMonth ? 1 : .5, minHeight: view === "week" ? 200 : 0 }}>
                        <div className="flex items-center justify-between">
                          <span className={cToday ? "grid h-5 w-5 place-items-center rounded-lg text-[11px] font-medium" : "text-[12px] font-medium"} style={cToday ? { background: C.ink, color: "var(--bg)" } : { color: cell.getDay() === 0 ? "#C0392B" : cell.getDay() === 6 ? "#2A5DC7" : C.text }}>{cell.getDate()}</span>
                          {list.length > 0 && <span className="hidden text-[10px] font-medium sm:inline" style={{ color: C.faint }}>{list.length}</span>}
                        </div>
                        {/* mobile: dots */}
                        <div className="mt-1 flex flex-wrap gap-1 sm:hidden flex-1" style={{ minHeight: 8 }}>
                          {list.slice(0, 4).map((r) => <span key={r.id} onClick={(e) => { e.stopPropagation(); onBlockClick(r); }} className="h-1.5 w-1.5 rounded-full" style={{ background: pal(r.color).dot }} />)}
                        </div>
                        {/* desktop: chips */}
                        <div className="mt-1 hidden space-y-1 sm:block flex-1" style={{ minHeight: 54 }}>
                                                    {list.slice(0, view === "week" ? 10 : 3).map((r) => { const p = r.isUrgent ? pal('red') : pal('green'); return (
                            <div key={r.id} onClick={(e) => { e.stopPropagation(); onBlockClick(r); }} className="flex items-center gap-1 truncate rounded-lg px-1.5 py-0.5 text-[11px] font-medium" style={{ background: p.bg, color: p.text }}>
                              <span className="h-1.5 w-1.5 shrink-0 rounded-lg" style={{ background: p.dot }} /><span className="truncate">{r.start} {r.title}</span>
                            </div>
                          ); })}
                          {list.length > (view === "week" ? 10 : 3) && <div className="px-1 text-[10px] font-medium" style={{ color: C.faint }}>+{list.length - (view === "week" ? 10 : 3)} 더보기</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-2.5">
                  <div className="inline-flex rounded-lg border bg-white p-1" style={{ borderColor: C.border }}>
                    {ROOMS.map((r) => { const on = roomId === r.id; return <button key={r.id} onClick={() => setRoomId(r.id)} className="rounded-lg px-3.5 py-1.5 text-sm font-medium sm:px-4" style={on ? { background: C.ink, color: "var(--bg)" } : { color: C.muted }}>{r.name}</button>; })}
                  </div>
                  <div className="flex items-center gap-2 text-xs" style={{ color: C.muted }}>
                    <span className="inline-flex items-center gap-1 font-medium"><Users size={13} />{room.capacity}명</span>
                    {room.equip.map((e) => <EquipChip key={e} type={e} />)}
                  </div>
                  <StatusPill kind={roomStatus(roomId).kind} text={roomStatus(roomId).text} />
                </div>
                <section className="rise rounded-lg border bg-white" style={{ borderColor: C.border, boxShadow: "0 1px 2px rgba(0,0,0,.04)" }}>
                  <div className="flex items-center justify-between border-b px-4 py-4 sm:px-5" style={{ borderColor: C.border }}>
                    <div><div className="text-[16px] font-medium">{room.name}</div><div className="mt-0.5 text-xs" style={{ color: C.muted }}>{fmtK(anchor)} · 09:00 – 22:00</div></div>
                    <button onClick={() => tryCreate(roomId, defStart())} className="lift flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium" style={{ background: C.ink, color: "var(--bg)", boxShadow: "0 1px 2px rgba(0,0,0,.05)" }}><Plus size={16} /> 새 예약</button>
                  </div>
                  <div ref={timelineScrollRef} className="sc overflow-y-auto px-4 py-4 sm:px-5 pb-8"><div className="flex">{Gutter()}<div className="min-w-0 flex-1">{Track({ rid: roomId })}</div></div></div>
                </section>
              </>
            )}
          </>
        )}

        
        {section === "install" && (
          <section className="rise rounded-lg border bg-white p-6 sm:p-10 text-center" style={{ borderColor: C.border, boxShadow: "0 1px 2px rgba(0,0,0,.04)" }}>
            <h2 className="text-2xl font-bold mb-4">앱 다운로드 및 설치 안내</h2>
            <p className="mb-6 text-gray-600">회의실 예약 서비스를 더 편리하게 이용하세요.</p>
            
            <div className="grid md:grid-cols-2 gap-8 text-left">
              <div className="border p-5 rounded-xl bg-gray-50">
                <h3 className="text-lg font-bold mb-3">📱 Android 사용자</h3>
                <p className="text-sm mb-4">아래 버튼을 눌러 APK 파일을 다운로드하고 설치해주세요. 설치 시 <b>"출처를 알 수 없는 앱 허용"</b>이 필요할 수 있습니다.</p>
                <a href="/foundfoundedmeet.apk" className="block text-center bg-black text-white font-bold py-3 rounded-lg shadow-md hover:bg-gray-800 transition">Android APK 다운로드</a>
              </div>
              
              <div className="border p-5 rounded-xl bg-gray-50">
                <h3 className="text-lg font-bold mb-3">🍎 iOS (iPhone) 사용자</h3>
                <p className="text-sm mb-2">iOS는 홈 화면에 추가하여 앱처럼 사용할 수 있습니다.</p>
                <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
                  <li><b>Safari</b> 브라우저로 접속합니다.</li>
                  <li>하단의 <b>공유</b> 버튼(네모 안의 위쪽 화살표)을 누릅니다.</li>
                  <li>메뉴에서 <b>"홈 화면에 추가"</b>를 선택합니다.</li>
                </ol>
              </div>
            </div>
          </section>
        )}

        {section === "mine" && (
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-medium">내 예약</h2>
                <input 
                  type="date" 
                  value={mineDate} 
                  onChange={(e) => setMineDate(e.target.value || keyOf(new Date()))} 
                  className="inp rounded-lg border px-2 py-1.5 text-xs font-medium outline-none" 
                  style={{ borderColor: C.border, background: "var(--bg-input)" }} 
                />
              </div>
              {user && (
                <button 
                  onClick={() => setSection("book")} 
                  className="lift flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold"
                  style={{ borderColor: C.border, color: C.muted }}
                >
                  <Plus size={14} /> 회의실 예약하기
                </button>
              )}
            </div>
            {!user ? (
              <div className="grid place-items-center rounded-lg border bg-white py-16 text-center" style={{ borderColor: C.border }}>
                <Lock size={30} style={{ color: C.faint }} /><p className="mt-3 text-sm font-semibold" style={{ color: C.muted }}>로그인하면 내 예약을 볼 수 있어요</p>
                <button onClick={() => requireAuth(() => setSection("mine"), "로그인하면 내 예약을 볼 수 있어요.")} className="lift mt-4 flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium" style={{ background: C.ink, color: "var(--bg)" }}><LogIn size={15} />로그인</button>
              </div>
            ) : myRes.length === 0 ? (
              <div className="grid place-items-center rounded-lg border bg-white py-16 text-center" style={{ borderColor: C.border }}>
                <Calendar size={32} style={{ color: C.faint }} /><p className="mt-3 text-sm font-semibold" style={{ color: C.muted }}>아직 예약이 없어요</p>
                <button onClick={() => setSection("book")} className="lift mt-4 rounded-lg px-4 py-2 text-sm font-medium" style={{ background: C.ink, color: "var(--bg)" }}>예약하러 가기</button>
              </div>
            ) : (
              <div className="grid gap-3">
                {myRes.map((r) => { const p = r.isUrgent ? pal('red') : pal('green'), rm = ROOMS.find((x) => x.id === r.roomId), [y, mo, da] = r.date.split("-").map(Number), d = new Date(y, mo - 1, da); return (
                  <div key={r.id} className="lift flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-lg border bg-white p-3.5 sm:p-4" style={{ borderColor: C.border }}>
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg" style={{ background: p.bg, color: p.text }}><span className="text-lg font-medium">{da}</span></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2"><span className="truncate text-[15px] font-medium">{r.title}</span>{r.repeat && <span className="inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: PASTEL.yellow.bg, color: PASTEL.yellow.text }}><Repeat size={10} />매주</span>}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium" style={{ color: C.muted }}><span className="flex items-center gap-1"><Building2 size={12} />{rm.name}</span><span className="flex items-center gap-1"><Clock size={12} />{fmtK(d)} {r.start}~{r.end}</span><span className="flex items-center gap-1"><Users size={12} />{r.attendees.length}명</span></div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5 justify-end sm:flex-nowrap sm:gap-2 mt-1 sm:mt-0">
                      <select onChange={(e) => { if (e.target.value) { extendRes(r, parseInt(e.target.value)); e.target.value = ""; } }} className="lift rounded-lg border px-2 py-1.5 text-xs font-medium outline-none cursor-pointer" style={{ borderColor: C.border, color: C.ink, background: "transparent" }}>
                        <option value="">연장하기</option>
                        <option value="5">+ 5분</option>
                        <option value="10">+ 10분</option>
                        <option value="15">+ 15분</option>
                        <option value="30">+ 30분</option>
                      </select>
                      <button onClick={() => completeRes(r)} className="lift rounded-lg border px-3 py-2 text-xs font-medium" style={{ borderColor: C.border, color: C.ink }}>회의 종료</button>
                      {canEdit(r) && (
                        <button onClick={() => { setRoomId(r.roomId); setAnchor(d); openEdit(r); setSection("book"); }} className="lift rounded-lg border px-3 py-2 text-xs font-medium" style={{ borderColor: C.border, color: C.muted }}>수정</button>
                      )}
                      {canDelete(r) && (
                        <button onClick={() => cancelRes(r.id)} className="lift flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium" style={{ background: PASTEL.red.bg, color: PASTEL.red.text }}><Trash2 size={13} /></button>
                      )}
                    </div>
                  </div>
                ); })}
              </div>
            )}
          </section>
        )}

        {section === "mypage" && (
          !user ? (
            <div className="grid place-items-center rounded-lg border bg-white py-16 text-center" style={{ borderColor: C.border }}>
              <Lock size={30} style={{ color: C.faint }} /><p className="mt-3 text-sm font-semibold" style={{ color: C.muted }}>로그인하면 마이페이지를 볼 수 있어요</p>
              <button onClick={() => requireAuth(() => setSection("mypage"), "로그인하면 마이페이지를 볼 수 있어요.")} className="lift mt-4 flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium" style={{ background: C.ink, color: "var(--bg)" }}><LogIn size={15} />로그인</button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 프로필 요약 카드 */}
              <div className="rise rounded-lg border bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ borderColor: C.border }}>
                <div className="flex items-center gap-4">
                  <div className="relative group cursor-pointer shrink-0" onClick={() => setShowProfileMenu(true)} title="프로필 설정">
                    <Avatar name={user} size={54} solid />
                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[10px] text-white font-bold">편집</span>
                    </div>
                  </div>
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      {user}님 마이페이지
                      {MEMBERS.find(m => m.name === user) && (
                        <TeamTag team={MEMBERS.find(m => m.name === user).team} />
                      )}
                    </h2>
                    <p className="text-xs mt-1" style={{ color: C.faint }}>
                      {MEMBERS.find(m => m.name === user) ? `${MEMBERS.find(m => m.name === user).role} · foundfounded 멤버` : "foundfounded 멤버"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSection("mine")} className="lift rounded-lg border px-4 py-2.5 text-xs font-semibold" style={{ borderColor: C.border, color: C.muted }}>
                    내 예약 내역
                  </button>
                  <button onClick={() => { setUser(null); setSection("book"); }} className="lift rounded-lg border px-4 py-2.5 text-xs font-semibold" style={{ borderColor: C.border, color: PASTEL.red.text }}>
                    로그아웃
                  </button>
                </div>
              </div>

              {/* 회의실 사용 현황 대시보드 */}
              <div className="pt-2">
                <Dashboard month={dashMonth} setMonth={setDashMonth} roomF={dashRoom} setRoomF={setDashRoom} now={now} reservations={myResAll} />
              </div>
            </div>
          )
        )}
      </main>

      {/* ===== mobile bottom nav ===== */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t md:hidden" style={{ background: theme === "dark" ? "rgba(0,0,0,0.92)" : "rgba(255,255,255,.92)", borderColor: C.border, backdropFilter: "blur(10px)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {NAV.map(([k, lbl, Icon]) => { const on = section === k; return (
            <button key={k} onClick={() => setSection(k)} className="relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium" style={{ color: on ? C.ink : (theme === "dark" ? "#D1D5DB" : C.faint) }}>
              {on && <span className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-lg" style={{ background: C.ink }} />}
              <Icon size={20} />{lbl}{k === "mine" && myRes.length ? ` ${myRes.length}` : ""}
            </button>
          ); })}
        </div>
      </nav>

      {/* ===== FAB (book section) ===== */}
      {section === "book" && (
        <button onClick={() => tryCreate(roomId, defStart())} className="lift fixed right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full md:hidden" style={{ bottom: "calc(env(safe-area-inset-bottom) + 68px)", background: C.ink, color: "var(--bg)", boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}><Plus size={26} /></button>
      )}

      {/* ===== Booking modal ===== */}
      {form && (
        <div className="ov fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" style={{ background: "rgba(20,20,20,.5)" }} onClick={() => setForm(null)}>
          <div className="sheet w-full rounded-t-lg bg-white sm:max-w-md sm:rounded-lg" style={{ maxHeight: "92vh", boxShadow: "0 -4px 12px rgba(0,0,0,.08)" }} onClick={(e) => e.stopPropagation()}>
            <div className="sc max-h-[92vh] overflow-y-auto p-6">
              <div className="flex items-center justify-between"><h3 className="text-lg font-medium">{form.id ? "예약 수정" : "회의실 예약"}</h3><button onClick={() => setForm(null)} className="grid h-8 w-8 place-items-center rounded-lg" style={{ color: C.faint }}><X size={18} /></button></div>
              <div className="mt-5 space-y-4">
                <Field label="회의 제목" error={errs.title}>
                  <input value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); setErrs((x) => ({ ...x, title: undefined })); }} placeholder="예: 제품팀 스프린트 플래닝" className="inp w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none" style={{ borderColor: errs.title ? "#C0392B" : C.border }} />
                </Field>
                <Field label="회의실"><SelectBox value={form.roomId} onChange={(v) => setForm({ ...form, roomId: v })} options={ROOMS.map((r) => [r.id, `${r.name} · ${r.capacity}명`])} /></Field>
                <Field label="날짜">
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="inp w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none" style={{ borderColor: C.border, background: "var(--bg-select)" }} />
                </Field>
                <Field label="시간" error={errs.time}>
                  <div className="grid grid-cols-2 gap-3">
                    <SelectBox
                      value={form.start}
                      onChange={(v) => {
                        setForm({
                          ...form,
                          start: v,
                          end: toMin(form.end) <= toMin(v) ? toHHMM(Math.min(toMin(v) + 60, DAY_END)) : form.end
                        });
                        setErrs((x) => ({ ...x, time: undefined }));
                      }}
                      options={TIMES.slice(0, -1).map(t => [t, t])}
                      error={errs.time}
                    />
                    <SelectBox
                      value={form.end}
                      onChange={(v) => {
                        setForm({ ...form, end: v });
                        setErrs((x) => ({ ...x, time: undefined }));
                      }}
                      options={TIMES.filter(t => toMin(t) > toMin(form.start)).map(t => [t, t])}
                      error={errs.time}
                    />
                  </div>
                </Field>

                <Field label="색상">
                  <div className="flex items-center gap-2.5">
                    {COLORS.map((c) => { const on = form.color === c; return (
                      <button key={c} onClick={() => setForm({ ...form, color: c })} className="flex h-3.5 w-3.5 place-items-center justify-center rounded-full transition-transform" title={c} style={{ background: PASTEL[c].dot, boxShadow: on ? `0 0 0 2px var(--bg-input), 0 0 0 3px ${C.ink}` : "none", transform: on ? "scale(1.2)" : "none" }}></button>
                    ); })}
                  </div>
                </Field>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: C.muted }}>참석자 <span style={{ color: "var(--faint)" }}>· 참석 인원 {form.attendees.length}명</span></span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5" style={{ borderColor: errs.att ? "#C0392B" : C.border, background: "var(--bg-secondary)", minHeight: 46 }}>
                    {form.attendees.length ? form.attendees.map((id) => {
                      const m = M(id);
                      if (!m) return null;
                      return (
                        <span key={id} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px]" style={{ background: "var(--bg-chip)", color: C.text }}>
                          <span className="h-2 w-2 rounded-full" style={{ background: C.muted }} />
                          <span><span className="font-bold">{m.team}</span> <span className="font-medium">{m.name}님</span></span>
                        </span>
                      );
                    }) : <span className="text-sm" style={{ color: C.faint }}>선택된 참석자가 없어요</span>}
                  </div>
                  {errs.att && <div className="mt-1.5 flex items-center gap-1 text-xs font-semibold" style={{ color: PASTEL.red.text }}><AlertCircle size={12} />{errs.att}</div>}
                  <button onClick={openPicker} className="lift mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-medium" style={{ borderColor: C.ink, color: C.ink }}><UserPlus size={16} /> 참석자 선택</button>
                </div>
              </div>
              <div className="mt-6 flex gap-2.5">
                {form.id && canDelete(form) && (
                  <button onClick={() => cancelRes(form.id)} className="lift rounded-lg px-4 py-3 text-sm font-medium" style={{ background: PASTEL.red.bg, color: PASTEL.red.text }}><Trash2 size={15} /></button>
                )}
                <button onClick={() => setForm(null)} className="lift flex-1 rounded-lg border py-3 text-sm font-medium" style={{ borderColor: C.border, color: C.muted }}>취소</button>
                <button 
                  onClick={saveForm} 
                  disabled={isSubmitting}
                  className="lift flex flex-[2] items-center justify-center gap-1.5 rounded-lg py-3 text-sm font-medium" 
                  style={{ 
                    background: isSubmitting ? "#a0aec0" : "#2383E2", 
                    color: "#fff", 
                    boxShadow: "0 1px 2px rgba(0,0,0,.05)",
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    opacity: isSubmitting ? 0.7 : 1
                  }}
                >
                  <Check size={16} /> {isSubmitting ? "처리 중..." : (form.id ? "수정 완료" : "지금 예약하기")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Attendee picker ===== */}
      {pickerOpen && (
        <div className="ov fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4" style={{ background: "rgba(20,20,20,.5)" }} onClick={() => setPickerOpen(false)}>
          <div className="sheet flex w-full flex-col rounded-t-lg bg-white sm:max-w-2xl sm:rounded-lg" style={{ maxHeight: "90vh", boxShadow: "0 -4px 12px rgba(0,0,0,.08)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b px-5 py-4" style={{ borderColor: C.border }}>
              <div><h3 className="text-lg font-medium">참석자 선택</h3><p className="text-xs" style={{ color: C.faint }}>멤버를 끌어다 놓거나 눌러서 추가하세요</p></div>
              <button onClick={() => setPickerOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg" style={{ color: C.faint }}><X size={18} /></button>
            </div>
            <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
              {/* dropzone (top on mobile / right on desktop) */}
              <div className="order-1 flex shrink-0 flex-col border-b p-3 md:order-2 md:w-1/2 md:border-b-0 md:border-l" style={{ borderColor: C.border }}>
                <div className="mb-2 px-1 text-xs font-medium" style={{ color: C.muted }}>참석자 ({temp.length})</div>
                <div onDragOver={(e) => { e.preventDefault(); setDz(true); }} onDragLeave={() => setDz(false)} onDrop={(e) => { e.preventDefault(); addTemp(e.dataTransfer.getData("text/plain")); setDz(false); }}
                  className="sc overflow-y-auto rounded-lg border-2 border-dashed p-3" style={{ borderColor: dz ? C.ink : C.border, background: dz ? C.yellowSoft : "var(--bg-secondary)", minHeight: 120, maxHeight: 220 }}>
                  {temp.length === 0 ? (
                    <div className="grid h-full place-items-center py-6 text-center"><div><UserPlus size={26} style={{ color: C.faint }} className="mx-auto" /><p className="mt-2 text-xs font-semibold" style={{ color: C.faint }}>여기로 멤버를 끌어다 놓으세요</p></div></div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {temp.map((id) => { const m = M(id); return (
                        <span key={id} className="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium" style={{ borderColor: C.border, background: "var(--bg-input)" }}>
                          <TeamTag team={m?.team} /><span>{m?.name}님</span>
                          <button onClick={() => toggleTemp(id)} className="grid h-4 w-4 place-items-center rounded-lg" style={{ background: "var(--bg-chip)" }}><X size={11} /></button>
                        </span>
                      ); })}
                    </div>
                  )}
                </div>
              </div>
              {/* roster */}
              <div className="sc order-2 flex-1 overflow-y-auto p-3 md:order-1">
                {[["director", "디렉터"], ["staff", "임직원"]].map(([g, label]) => {
                  const rows = MEMBERS.filter((m) => m.group === g);
                  return (
                    <div key={g} className="mb-2">
                      <div className="px-1.5 py-1 text-xs font-medium" style={{ color: C.muted }}>{label} ({rows.length})</div>
                      {rows.map((m) => { const on = temp.includes(m.id), me = m.id === getMeId(); return (
                        <div key={m.id} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", m.id); e.dataTransfer.effectAllowed = "copy"; }} onClick={() => toggleTemp(m.id)}
                          className="mrow mb-1 flex items-center gap-2.5 rounded-lg border px-2.5 py-2" style={{ borderColor: on ? C.ink : "transparent", background: on ? C.yellowSoft : "transparent" }}>
                          <GripVertical size={14} style={{ color: C.faint }} className="hidden sm:block" />
                          <Avatar name={m.name} size={32} />
                          <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><TeamTag team={m.team} /><span className="truncate text-sm font-medium">{m.name}님{me ? " (나)" : ""}</span></div><div className="text-[11px]" style={{ color: C.faint }}>{m.role}</div></div>
                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-lg border" style={on ? { background: C.ink, borderColor: C.ink } : { borderColor: C.border }}>{on && <Check size={13} color={C.yellow} />}</span>
                        </div>
                      ); })}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2.5 border-t px-5 py-4" style={{ borderColor: C.border }}>
              <button onClick={() => setTemp([])} className="text-xs font-medium" style={{ color: C.muted }}>전체 비우기</button>
              <div className="flex gap-2.5">
                <button onClick={() => setPickerOpen(false)} className="lift rounded-lg border px-5 py-2.5 text-sm font-medium" style={{ borderColor: C.border, color: C.muted }}>취소</button>
                <button onClick={donePicker} className="lift flex items-center gap-1.5 rounded-lg px-6 py-2.5 text-sm font-medium" style={{ background: C.ink, color: "var(--bg)", boxShadow: "0 1px 2px rgba(0,0,0,.05)" }}><Check size={16} />완료 ({temp.length})</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Day Events Popup Modal ===== */}
      {dayEventsDate && (() => {
        const dateStr = keyOf(dayEventsDate);
        const list = (byDate[dateStr] || []).slice().sort((a, b) => toMin(a.start) - toMin(b.start));
        return (
          <div className="ov fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" style={{ background: "rgba(20,20,20,.5)" }} onClick={() => setDayEventsDate(null)}>
            <div className="sheet w-full rounded-t-lg bg-white p-6 sm:max-w-md sm:rounded-lg flex flex-col max-h-[85vh] sm:max-h-[75vh]" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b pb-3 mb-4" style={{ borderColor: C.border }}>
                <div className="flex items-center gap-2">
                  <CalendarDays size={18} style={{ color: C.ink }} />
                  <h3 className="text-[17px] font-semibold">{fmtK(dayEventsDate)} 예약 일정</h3>
                </div>
                <button onClick={() => setDayEventsDate(null)} className="grid h-8 w-8 place-items-center rounded-lg" style={{ color: C.faint }}><X size={18} /></button>
              </div>
              
              <div className="sc overflow-y-auto pr-1 flex-1 space-y-2.5" style={{ maxHeight: "300px" }}>
                {list.length === 0 ? (
                  <div className="py-8 text-center text-sm font-semibold" style={{ color: C.muted }}>등록된 일정이 없습니다.</div>
                ) : (
                  list.map((r) => {
                    const p = pal(r.color);
                    const rm = ROOMS.find((x) => x.id === r.roomId);
                    return (
                      <div
                        key={r.id}
                        onClick={() => { setDayEventsDate(null); setDetail(r); }}
                        className="blk rounded-lg border p-3.5 transition-all hover:scale-[1.01]"
                        style={{ background: p.bg, borderColor: p.line, color: p.text }}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.dot }} />
                            <span className="text-[14px] font-semibold truncate max-w-[180px] sm:max-w-[220px]">{r.title}</span>
                            {r.repeat && <Repeat size={11} />}
                          </div>
                          <span className="text-[10px] font-semibold rounded px-2 py-0.5" style={{ background: theme === "dark" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.6)", color: p.text }}>
                            {rm?.name || "회의실"}
                          </span>
                        </div>
                        <div className="text-[12px] opacity-90 space-y-0.5 font-medium">
                          <div className="flex items-center gap-1"><Clock size={12} style={{ opacity: 0.7 }} /> {r.start} ~ {r.end}</div>
                          <div className="flex items-center gap-1"><User size={12} style={{ opacity: 0.7 }} /> 등록자: {r.owner}님 · 참석자: {r.attendees.length}명</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              
              <div className="mt-4 border-t pt-4 flex flex-col" style={{ borderColor: C.border }}>
                <button
                  onClick={() => {
                    const targetDate = dayEventsDate;
                    setDayEventsDate(null);
                    tryCreate(roomId, defStart(), keyOf(targetDate));
                  }}
                  className="lift flex w-full items-center justify-center gap-1.5 rounded-lg py-3.5 text-sm font-medium"
                  style={{ background: C.ink, color: "var(--bg)", boxShadow: "0 1px 2px rgba(0,0,0,.05)" }}
                >
                  <Plus size={16} /> 일정 추가하기
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== Detail ===== */}
      {detail && (
        <div className="ov fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" style={{ background: "rgba(20,20,20,.5)" }} onClick={() => setDetail(null)}>
          <div className="sheet w-full rounded-t-lg bg-white p-6 sm:max-w-sm sm:rounded-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b pb-3 mb-3" style={{ borderColor: C.border }}><span className="h-3 w-3 rounded-full" style={{ background: pal(detail.color).dot }} /><h3 className="text-[17px] font-semibold">{detail.title}</h3></div>
            <div className="space-y-1">
              <DetailRow icon={Clock} label="시간" value={`${detail.date} ${detail.start} ~ ${detail.end}`} />
              <DetailRow icon={Users} label="참석자" value={detail.attendees.length ? detail.attendees.map(memLabel).join(", ") : "없음"} />
              <DetailRow icon={User} label="등록자" value={`${detail.owner}님`} />
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              {canEdit(detail) && (
                <button onClick={() => { const d = detail; setDetail(null); setRoomId(d.roomId); openEdit(d); }} className="lift rounded-lg border px-4 py-2 text-xs font-semibold" style={{ background: C.ink, borderColor: C.ink, color: "var(--bg)" }}>수정</button>
              )}
              {canDelete(detail) && (
                <button onClick={() => cancelRes(detail.id)} className="lift rounded-lg px-4 py-2 text-xs font-semibold" style={{ background: PASTEL.red.bg, color: PASTEL.red.text }}>삭제</button>
              )}
              <button onClick={() => setDetail(null)} className="lift rounded-lg border px-4 py-2 text-xs font-semibold" style={{ borderColor: C.border, color: C.muted }}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Login modal ===== */}
      {authOpen && <LoginModal message={authMsg} onClose={() => { setAuthOpen(false); setAuthPending(null); }} onLogin={doLogin} />}

      {/* ===== Profile Image Edit Menu ===== */}
      {showProfileMenu && (
        <div className="ov fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(20,20,20,.5)" }} onClick={() => setShowProfileMenu(false)}>
          <div className="sheet w-full max-w-xs rounded-lg bg-white p-5 flex flex-col" style={{ boxShadow: "0 4px 12px rgba(0,0,0,.12)" }} onClick={(e) => e.stopPropagation()}>
            <h4 className="text-[14px] font-semibold text-center mb-4">프로필 이미지 설정</h4>
            <div className="flex flex-col gap-2">
              <button 
                onClick={() => {
                  setShowProfileMenu(false);
                  fileInputRef.current?.click();
                }}
                className="lift rounded-lg border py-2.5 text-xs font-semibold text-center w-full"
                style={{ borderColor: C.border, color: C.ink }}
              >
                프로필 이미지 추가하기
              </button>
              <button 
                onClick={handleDeleteProfileImage}
                className="lift rounded-lg border py-2.5 text-xs font-semibold text-center w-full"
                style={{ borderColor: C.border, color: PASTEL.red.text }}
              >
                프로필 이미지 삭제하기
              </button>
              <button 
                onClick={() => setShowProfileMenu(false)}
                className="lift mt-2 rounded-lg py-2.5 text-xs font-semibold text-center w-full text-gray-500"
                style={{ background: "var(--bg-input)" }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Toast ===== */}
      {toast && <div className="tdrop fixed left-1/2 top-5 z-[80] flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium" style={{ background: C.ink, color: "var(--bg)", boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}><CheckCircle2 size={16} style={{ color: "var(--yellow)" }} /> {toast}</div>}
    </div>
  );
}

/* ===================== helpers ===================== */
function Field({ label, error, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium" style={{ color: C.muted }}>{label}</span>
      {children}
      {error && <span className="mt-1.5 flex items-center gap-1 text-xs font-semibold" style={{ color: PASTEL.red.text }}><AlertCircle size={12} />{error}</span>}
    </label>
  );
}
function SelectBox({ value, onChange, options, error }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className="inp w-full rounded-lg border px-3.5 py-2.5 pr-9 text-sm outline-none" style={{ borderColor: error ? "#C0392B" : C.border, background: "var(--bg-select)" }}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <ChevronRight size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90" style={{ color: C.faint }} />
    </div>
  );
}
function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-4 py-1.5">
      <div className="flex items-center gap-1.5 w-[84px] shrink-0 text-[13px]" style={{ color: C.muted }}>
        <Icon size={14} style={{ color: C.faint }} /><span>{label}</span>
      </div>
      <div className="text-[13px] font-medium flex-1 truncate" style={{ color: C.text }}>{value}</div>
    </div>
  );
}
