import { Monitor, Video } from "lucide-react";

/* ===================== design tokens ===================== */
export const C = {
  ink: "var(--ink)", paper: "var(--paper)", bg: "var(--bg)",
  yellow: "var(--yellow)", yellowDeep: "var(--yellow-deep)", yellowSoft: "var(--yellow-soft)",
  border: "var(--border)", line: "var(--line)", text: "var(--text)", muted: "var(--muted)", faint: "var(--faint)",
};

export const PASTEL = {
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

export const COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];
export const pal = (c) => PASTEL[c] || PASTEL.yellow;

export const EQUIP = { monitor: { label: "모니터", Icon: Monitor }, video: { label: "화상회의", Icon: Video } };
export const ROOMS = [
  { id: "big",   name: "큰 회의실",   capacity: 8, equip: ["monitor", "video"], group: "meeting" },
  { id: "small", name: "작은 회의실", capacity: 7, equip: ["monitor"], group: "meeting" },
  { id: "lounge", name: "라운지", capacity: 20, equip: [], group: "meeting" },
  { id: "workroom", name: "워크룸", capacity: 3, equip: [], group: "workroom" },
];

/* members — 성 제외, 표시는 "{name}님" */
export const MEMBERS = [
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
  { id: "m4",  name: "도영", team: "VD", role: "인턴",            group: "staff", inactive: true },
  { id: "m14", name: "정수", team: "ID", role: "인턴",            group: "staff" },
  { id: "m16", name: "여준", team: "ID", role: "인턴",            group: "staff" },
  { id: "m_guest", name: "Guest", team: "게스트", role: "게스트", group: "guest" },
  { id: "m_client", name: "클라이언트", team: "외부", role: "클라이언트", group: "client" },
  { id: "m_room", name: "회의실", team: "공용", role: "회의실", group: "admin" },
];

export const M = (id) => MEMBERS.find((x) => x.id === id);
export const memLabel = (id) => { const m = M(id); return m ? `${m.team} ${m.name === "회의실" ? m.name : m.name + "님"}` : id; };
export const nameWithNim = (n) => n === "회의실" ? n : (n ? n + "님" : "");

/* timeline geometry */
export const DAY_START = 9 * 60;
export const DAY_END = 22 * 60;
export const STEP = 5;
export const PX = 15;
export const SLOTS = (DAY_END - DAY_START) / STEP;
export const GUTTER = 48;
