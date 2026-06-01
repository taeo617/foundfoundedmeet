import { useState, useEffect, useMemo, useRef } from "react";
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import {
  Calendar, CalendarDays, Clock, Users, Monitor, Video, Plus, X, Check,
  CheckCircle2, Repeat, AlertCircle, ChevronLeft, ChevronRight, Trash2,
  Building2, List, LogOut, Lock, User, UserPlus, GripVertical, LogIn,
  LayoutDashboard, HelpCircle, Sun, Moon,
} from "lucide-react";

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
const ampm = (t) => { const m = toMin(t), h = Math.floor(m / 60); const l = h < 12 ? "오전" : "오후"; const hh = h % 12 === 0 ? 12 : h % 12; return `${l} ${pad(hh)}:${pad(m % 60)}`; };
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtK = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) => keyOf(a) === keyOf(b);
const TIMES = Array.from({ length: SLOTS + 1 }, (_, i) => toHHMM(DAY_START + i * STEP));
let UID = 100; const nid = () => `r_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;

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
function Avatar({ label, size = 36, solid = false }) {
  return <span className="grid shrink-0 place-items-center rounded-full font-medium" style={{ width: size, height: size, fontSize: size * 0.36, background: solid ? "var(--bg-avatar)" : "var(--bg-input)", border: `1px solid ${C.border}`, color: C.muted }}>{label}</span>;
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
            if (r.roomId === "big") {
              dObj.big += 1;
              big += durationMin;
            } else if (r.roomId === "small") {
              dObj.small += 1;
              small += durationMin;
            }
            dObj.total += 1;
          }
        }
      }
    });
  }

  const total = daily.reduce((acc, curr) => acc + curr.total, 0);
  const totalMin = Math.round(big + small);
  const mostUsed = big > small ? "큰 회의실" : small > big ? "작은 회의실" : "-";
  const leastUsed = big > small ? "작은 회의실" : small > big ? "큰 회의실" : "-";
  return { 
    days, 
    daily, 
    total, 
    totalMin, 
    mostUsed, 
    leastUsed, 
    mostMin: Math.round(big), 
    leastMin: Math.round(small)
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
  const barW = 22, gap = 8, chartH = 190, padB = 24, padT = 20;
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
        <StatCard label="총 회의실 사용 시간" value={`${data.totalMin}분`} delay={40} />
        <StatCard label="가장 많이 사용된 회의실" sub={`${data.mostMin}분`} value={data.mostUsed} delay={80} />
        <StatCard label="가장 적게 사용된 회의실" sub={`${data.leastMin}분`} value={data.leastUsed} delay={120} />
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
                    background: inM ? "var(--bg-input)" : "transparent", 
                    border: inM ? `1px solid ${C.border}` : "none",
                    minHeight: "48px"
                  }}
                >
                  {inM ? (
                    <>
                      <span className="text-[9px] font-semibold block text-left" style={{ color: C.faint }}>{c.getDate()}</span>
                      <span className="text-[11px] font-bold block" style={{ color: v > 0 ? "var(--ink-deep)" : C.faint }}>
                        {v > 0 ? `${v}건` : "-"}
                      </span>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-end text-[10px] font-medium" style={{ color: C.faint }}>
            * 각 날짜별로 실제 등록된 예약 건수(건)를 보여줍니다.
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
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: C.inkDeep }} />작은</span>
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
                    <rect x={xx} y={baseY - sH} width={barW} height={sH} fill={C.yellowDeep} rx="2" />
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
  const [user, setUser] = useState(null);
  const userRef = useRef(null); userRef.current = user;
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
  const [roomId, setRoomId] = useState("big");
  const [reservations, setReservations] = useState(() => {
    if (!isFirebaseConfigured) {
      try {
        const local = localStorage.getItem("reservations");
        return local ? JSON.parse(local) : [];
      } catch (e) {
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
  const [dashMonth, setDashMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [dashRoom, setDashRoom] = useState("all");
  const [dayEventsDate, setDayEventsDate] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const getMeId = () => { const u = userRef.current; const m = MEMBERS.find((x) => u && (x.name.includes(u) || u.includes(x.name))); return m ? m.id : null; };
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
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  function requireAuth(fn, msg) { if (userRef.current) return fn(); setAuthMsg(msg || "계속하려면 로그인이 필요해요."); setAuthPending(() => fn); setAuthOpen(true); }
  function doLogin(name) { setReservations((p) => p.map((r) => (r.owner === "나" ? { ...r, owner: name } : r))); setUser(name); setAuthOpen(false); }
  useEffect(() => { if (user && authPending) { const p = authPending; setAuthPending(null); p(); } }, [user]); // eslint-disable-line

  const myRes = useMemo(() => {
    if (!user) return [];
    const meId = MEMBERS.find((m) => m.name === user)?.id;
    return reservations.filter((r) => {
      return r.owner === user || (meId && r.attendees && r.attendees.includes(meId));
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
  function openCreate(rid, startMin, date) { setErrs({}); const me = getMeId(); setForm({ id: null, roomId: rid, title: "", date: date || selKey, start: toHHMM(startMin), end: toHHMM(Math.min(startMin + 60, DAY_END)), attendees: me ? [me] : [], repeat: false, color: "yellow" }); }
  const tryCreate = (rid, sm, date) => requireAuth(() => openCreate(rid, sm, date), "일정을 추가하려면 로그인이 필요해요.");
  const openEdit = (r) => { setErrs({}); setForm({ ...r, attendees: [...r.attendees] }); };

  async function saveForm() {
    if (isSubmitting) return;
    const f = form; const e = {};
    if (!f.title.trim()) e.title = "회의 제목을 입력해주세요.";
    if (toMin(f.end) <= toMin(f.start)) e.time = "종료 시간은 시작 시간보다 늦어야 해요.";
    else if (overlaps(f.roomId, f.date, f.start, f.end, f.id)) e.time = "선택한 시간에 이미 다른 예약이 있어요.";
    if (f.attendees.length === 0) e.att = "참석자를 1명 이상 선택해주세요.";
    if (f.attendees.length > ROOMS.find((r) => r.id === f.roomId).capacity) e.att = "참석 인원이 회의실 정원을 초과했어요.";
    setErrs(e);
    if (Object.keys(e).length) return;
    
    setIsSubmitting(true);
    if (isFirebaseConfigured) {
      try {
        if (f.id) { 
          await updateDoc(doc(db, "reservations", f.id), { ...f, title: f.title.trim() });
          showToast("예약을 수정했어요."); 
        } else { 
          const newId = nid();
          await setDoc(doc(db, "reservations", newId), { ...f, id: newId, title: f.title.trim(), owner: user });
          showToast("예약이 완료됐어요."); 
        }
        setForm(null);
      } catch (err) {
        console.error(err);
        showToast("오류가 발생했습니다.");
      } finally {
        setIsSubmitting(false);
      }
    } else {
      try {
        if (f.id) {
          setReservations((prev) => prev.map((r) => r.id === f.id ? { ...f, title: f.title.trim() } : r));
          showToast("예약을 수정했어요.");
        } else {
          const newId = nid();
          const newRes = { ...f, id: newId, title: f.title.trim(), owner: user };
          setReservations((prev) => [...prev, newRes]);
          showToast("예약이 완료됐어요.");
        }
        setForm(null);
      } catch (err) {
        console.error(err);
        showToast("오류가 발생했습니다.");
      } finally {
        setIsSubmitting(false);
      }
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
      if (overlaps(r.roomId, r.date, toHHMM(endM), toHHMM(newEndM), r.id)) {
        showToast("다음 예약과 겹쳐 연장할 수 없어요.");
        return;
      }
      
      if (isFirebaseConfigured) {
        updateDoc(doc(db, "reservations", r.id), { end: toHHMM(newEndM) }).then(() => {
          showToast(`회의를 ${mins}분 연장했어요.`);
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
          const top = ((toMin(r.start) - DAY_START) / STEP) * PX, h = ((toMin(r.end) - toMin(r.start)) / STEP) * PX, p = pal(r.color), mine = isMine(r);
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

  const NAV = [["book", "예약", CalendarDays], ["mine", "내 예약", List]];

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
        input,select,button{font-family:inherit;} select{appearance:none;-webkit-appearance:none;}`}</style>

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
                  <Avatar label={user.slice(0, 2)} size={24} solid={section === "mypage"} />
                  <span style={{ color: C.text }}>{user}님</span>
                </button>
                <button onClick={() => { setUser(null); if (section === "mypage" || section === "dash") setSection("book"); }} title="로그아웃" className="lift grid h-9 w-9 place-items-center rounded-[4px] border" style={{ borderColor: C.border, color: C.muted }}><LogOut size={15} /></button>
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
                {[["calendar", "캘린더", CalendarDays], ["timeline", "타임라인", List]].map(([k, lbl, Icon]) => (
                  <button key={k} onClick={() => setView(k)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium" style={view === k ? { background: C.ink, color: "var(--bg)" } : { color: C.muted }}><Icon size={15} /><span className="hidden sm:inline">{lbl}</span></button>
                ))}
              </div>
            </div>

            {view === "calendar" ? (
              <section className="rise rounded-lg border bg-white p-2.5 sm:p-4 flex-1 flex flex-col" style={{ borderColor: C.border, boxShadow: "0 1px 2px rgba(0,0,0,.04)" }}>
                <div className="mb-2 hidden items-center justify-end px-1 text-xs font-medium sm:flex" style={{ color: C.faint }}>날짜를 누르면 해당 날짜로 이동 · 색상은 예약 시 직접 지정</div>
                <div className="grid grid-cols-7 overflow-hidden rounded-lg border flex-1" style={{ borderColor: C.border, gridTemplateRows: "auto repeat(6, 1fr)" }}>
                  {WEEK.map((w, i) => <div key={w} className="border-b py-2 text-center text-[11px] font-medium sm:text-xs" style={{ borderColor: C.border, background: "var(--bg-secondary)", color: i === 0 ? "#C0392B" : i === 6 ? "#2A5DC7" : C.muted }}>{w}</div>)}
                  {cells.map((cell, i) => {
                    const inMonth = cell.getMonth() === anchor.getMonth(), cToday = sameDay(cell, today);
                    const list = (byDate[keyOf(cell)] || []).slice().sort((a, b) => toMin(a.start) - toMin(b.start));
                    return (
                      <div key={i} onClick={() => { if (list.length > 0) { setDayEventsDate(cell); } else { tryCreate(roomId, defStart(), keyOf(cell)); } }} className="cell border-b border-l p-1 sm:p-1.5 flex flex-col" style={{ borderColor: C.border, background: cToday ? C.yellowSoft : inMonth ? "var(--bg-input)" : "var(--bg-tertiary)", opacity: inMonth ? 1 : .5, minHeight: 0 }}>
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
                          {list.slice(0, 3).map((r) => { const p = pal(r.color); return (
                            <div key={r.id} onClick={(e) => { e.stopPropagation(); onBlockClick(r); }} className="flex items-center gap-1 truncate rounded-lg px-1.5 py-0.5 text-[11px] font-medium" style={{ background: p.bg, color: p.text }}>
                              <span className="h-1.5 w-1.5 shrink-0 rounded-lg" style={{ background: p.dot }} /><span className="truncate">{r.start} {r.title}</span>
                            </div>
                          ); })}
                          {list.length > 3 && <div className="px-1 text-[10px] font-medium" style={{ color: C.faint }}>+{list.length - 3} 더보기</div>}
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
                  <div ref={timelineScrollRef} className="sc overflow-y-auto px-4 py-4 sm:px-5 pb-8"><div className="flex"><Gutter /><div className="min-w-0 flex-1"><Track rid={roomId} /></div></div></div>
                </section>
              </>
            )}
          </>
        )}

        {section === "mine" && (
          <section>
            <h2 className="mb-4 text-lg font-medium">내 예약</h2>
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
                {myRes.map((r) => { const p = pal(r.color), rm = ROOMS.find((x) => x.id === r.roomId), [y, mo, da] = r.date.split("-").map(Number), d = new Date(y, mo - 1, da); return (
                  <div key={r.id} className="lift flex items-center gap-3 rounded-lg border bg-white p-3.5 sm:gap-4 sm:p-4" style={{ borderColor: C.border }}>
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg" style={{ background: p.bg, color: p.text }}><span className="text-lg font-medium">{da}</span></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><span className="truncate text-[15px] font-medium">{r.title}</span>{r.repeat && <span className="inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: PASTEL.yellow.bg, color: PASTEL.yellow.text }}><Repeat size={10} />매주</span>}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium" style={{ color: C.muted }}><span className="flex items-center gap-1"><Building2 size={12} />{rm.name}</span><span className="flex items-center gap-1"><Clock size={12} />{fmtK(d)} {r.start}~{r.end}</span><span className="flex items-center gap-1"><Users size={12} />{r.attendees.length}명</span></div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5 justify-end sm:flex-nowrap sm:gap-2">
                      <select onChange={(e) => { if (e.target.value) { extendRes(r, parseInt(e.target.value)); e.target.value = ""; } }} className="lift rounded-lg border px-2 py-1.5 text-xs font-medium outline-none cursor-pointer" style={{ borderColor: C.border, color: C.ink, background: "transparent" }}>
                        <option value="">연장하기</option>
                        <option value="5">+ 5분</option>
                        <option value="10">+ 10분</option>
                        <option value="15">+ 15분</option>
                        <option value="30">+ 30분</option>
                      </select>
                      <button onClick={() => completeRes(r)} className="lift rounded-lg border px-3 py-2 text-xs font-medium" style={{ borderColor: C.border, color: C.ink }}>지금 완료</button>
                      {canEdit(r) && (
                        <button onClick={() => { setRoomId(r.roomId); setAnchor(d); openEdit(r); }} className="lift rounded-lg border px-3 py-2 text-xs font-medium" style={{ borderColor: C.border, color: C.muted }}>수정</button>
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
                  <Avatar label={user.slice(0, 2)} size={54} solid />
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
                <Dashboard month={dashMonth} setMonth={setDashMonth} roomF={dashRoom} setRoomF={setDashRoom} now={now} reservations={myRes} />
              </div>
            </div>
          )
        )}
      </main>

      {/* ===== mobile bottom nav ===== */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t md:hidden" style={{ background: "rgba(255,255,255,.92)", borderColor: C.border, backdropFilter: "blur(10px)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {NAV.map(([k, lbl, Icon]) => { const on = section === k; return (
            <button key={k} onClick={() => setSection(k)} className="relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium" style={{ color: on ? C.ink : C.faint }}>
              {on && <span className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-lg" style={{ background: C.ink }} />}
              <Icon size={20} />{lbl}{k === "mine" && myRes.length ? ` ${myRes.length}` : ""}
            </button>
          ); })}
        </div>
      </nav>

      {/* ===== FAB (book section) ===== */}
      {section === "book" && (
        <button onClick={() => tryCreate(roomId, defStart())} className="lift fixed right-5 z-30 flex h-14 w-14 items-center justify-center rounded-lg md:hidden" style={{ bottom: "calc(env(safe-area-inset-bottom) + 68px)", background: C.ink, color: "var(--bg)", boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}><Plus size={26} /></button>
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
                          <Avatar label={m.name.slice(0, 1)} size={32} />
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
                          <span className="text-[10px] font-semibold rounded px-2 py-0.5" style={{ background: "rgba(255,255,255,0.6)", color: p.text }}>
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
