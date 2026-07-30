import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.join(__dirname, '../src/App.jsx');

let code = fs.readFileSync(appPath, 'utf8');

// 1. Add import
if (!code.includes('import { useResources }')) {
  code = code.replace(
    'import { db, isFirebaseConfigured } from "./firebase";',
    'import { db, isFirebaseConfigured } from "./firebase";\nimport { useResources } from "./hooks/useResources";'
  );
}

// 2. Remove global DAY_START, DAY_END, SLOTS, TIMES, getClosestTime
code = code.replace(
  /const DAY_START = 9 \* 60, DAY_END = 22 \* 60, STEP = 5, PX = 15;\nconst SLOTS = \(DAY_END - DAY_START\) \/ STEP, GUTTER = 48;/g,
  'const STEP = 5, PX = 15, GUTTER = 48;'
);

code = code.replace(
  /const TIMES = Array\.from\(\{ length: SLOTS \+ 1 \}, \(_, i\) => toHHMM\(DAY_START \+ i \* STEP\)\);\nconst getClosestTime = \(tStr\) => \{[\s\S]*?return closest;\n\};/g,
  ''
);

// 3. Inject into App()
if (!code.includes('const { resources } = useResources();')) {
  code = code.replace(
    'export default function App() {',
    `export default function App() {
  const { resources } = useResources();
  const meetingRoomRes = resources.find(r => r.id === "meeting-room") || { policy: { openHours: { from: "09:00", to: "22:00" }, slotMinutes: 30 } };
  const DAY_START = toMin(meetingRoomRes.policy.openHours.from);
  const DAY_END = toMin(meetingRoomRes.policy.openHours.to);
  const SLOTS = (DAY_END - DAY_START) / STEP;
  const TIMES = Array.from({ length: SLOTS + 1 }, (_, i) => toHHMM(DAY_START + i * STEP));
  const getClosestTime = (tStr) => {
    if (!tStr) return TIMES[0];
    const m = toMin(tStr);
    if (isNaN(m)) return TIMES[0];
    let closest = TIMES[0], minDiff = Infinity;
    for (const t of TIMES) {
      const diff = Math.abs(toMin(t) - m);
      if (diff < minDiff) { minDiff = diff; closest = t; }
    }
    return closest;
  };`
  );
}

// 4. Update saveForm to include resourceId
if (!code.includes("resourceId: 'meeting-room'")) {
  code = code.replace(
    'const finalForm = { ...f, id: docId, title: f.title.trim(), owner: f.owner || user, attendees: cleanedAttendees, checkedIn: cleanedCheckedIn };',
    'const finalForm = { ...f, id: docId, title: f.title.trim(), owner: f.owner || user, attendees: cleanedAttendees, checkedIn: cleanedCheckedIn, resourceId: "meeting-room" };'
  );
}

fs.writeFileSync(appPath, code, 'utf8');
console.log('App.jsx patched successfully.');
