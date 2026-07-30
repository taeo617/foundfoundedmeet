import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.join(__dirname, '../src/App.jsx');

let code = fs.readFileSync(appPath, 'utf8');

// 1. ROOMS에 workroom 추가 및 type 추가
code = code.replace(
  /const ROOMS = \[\s*\{ id: "big".*?\{ id: "small".*?\{ id: "lounge".*?\];/s,
  `const ROOMS = [\n  { id: "big",   name: "큰 회의실",   capacity: 8, equip: ["monitor", "video"], group: "meeting" },\n  { id: "small", name: "작은 회의실", capacity: 7, equip: ["monitor"], group: "meeting" },\n  { id: "lounge", name: "라운지", capacity: 20, equip: [], group: "meeting" },\n  { id: "workroom", name: "워크룸", capacity: 3, equip: [], group: "workroom" },\n];`
);

// 3. NoticeModal / OccupancyBar 로직 구현 및 컴포넌트 추가할 자리
const componentsToAdd = `
function NoticeModal({ notice, onClose, onConfirm }) {
  const [checked, setChecked] = React.useState(new Array(notice.length).fill(false));
  const allChecked = checked.every(Boolean);

  return (
    <div className="ov fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="text-[17px] font-bold mb-4" style={{ color: "#111" }}>사용 전 확인사항</h3>
        <ul className="space-y-2 mb-6">
          {notice.map((txt, i) => (
            <li key={i} className="flex items-center gap-2 cursor-pointer" onClick={() => {
              const nc = [...checked];
              nc[i] = !nc[i];
              setChecked(nc);
            }}>
              <div className={\`w-5 h-5 rounded-md border flex items-center justify-center transition-colors \${checked[i] ? 'bg-[#1d9e75] border-[#1d9e75]' : 'border-gray-300'}\`}>
                {checked[i] && <CheckCircle2 size={14} color="white" />}
              </div>
              <span className="text-[14px] text-gray-700">{txt}</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 font-bold">취소</button>
          <button 
            disabled={!allChecked}
            onClick={() => { if(allChecked) onConfirm(); }} 
            className={\`flex-1 py-3 rounded-xl font-bold transition-opacity \${allChecked ? 'bg-[#1d9e75] text-white' : 'bg-gray-100 text-gray-400'}\`}
          >확인 및 시작</button>
        </div>
      </div>
    </div>
  );
}

function OccupancyBar({ capacity, current }) {
  const dots = Array.from({ length: capacity });
  return (
    <div className="flex gap-1.5 items-center mt-3">
      {dots.map((_, i) => (
        <div key={i} className={\`h-2 flex-1 rounded-full transition-colors \${i < current ? 'bg-white' : 'bg-white/30'}\`} />
      ))}
    </div>
  );
}
`;

code = code.replace(
  'function App() {',
  componentsToAdd + '\nfunction App() {'
);

// 4. 모달 상태 변수 추가
code = code.replace(
  'const [detail, setDetail] = useState(null);',
  'const [detail, setDetail] = useState(null);\n  const [noticeTarget, setNoticeTarget] = useState(null);'
);

// 5. handleStartSession을 notice 유무에 따라 분기
const handleStartOriginal = `const handleStartSession = async (res) => {`;
const handleStartModified = `const handleStartSession = async (res) => {
    const policy = resources.find(r => r.id === (res.resourceId || 'meeting-room'))?.policy;
    if (policy && policy.notice && policy.notice.length > 0 && !noticeTarget) {
      setNoticeTarget(res);
      return;
    }`;
code = code.replace(handleStartOriginal, handleStartModified);

// NoticeModal 렌더링 추가
code = code.replace(
  '{/* ===== Detail ===== */}',
  `{/* ===== Notice Modal ===== */}\n      {noticeTarget && (\n        <NoticeModal \n          notice={resources.find(r => r.id === (noticeTarget.resourceId || 'meeting-room'))?.policy?.notice || []} \n          onClose={() => setNoticeTarget(null)}\n          onConfirm={() => {\n            const target = noticeTarget;\n            setNoticeTarget(null);\n            handleStartSession(target);\n          }}\n        />\n      )}\n\n      {/* ===== Detail ===== */}`
);

// 6. 워크룸 상태 카드 표시 (OccupancyBar 등)
const statusCardRegex = /\{\/\* Status Card \(Only show context for today AND if not "all"\) \*\/\}.*?\{\/\* Detail List \*\/\}/s;

const newStatusCardCode = `{/* Status Card (Only show context for today AND if not "all") */}
        {isTodayAnchor && roomId !== "all" && (() => {
          const resInfo = resources.find(r => (r.id === roomId || (roomId === 'big' || roomId === 'small' || roomId === 'lounge' ? r.id === 'meeting-room' : false)));
          const policy = resInfo?.policy;
          
          if (policy?.capacity > 1) {
            // 다인용 자원 (Workroom)
            // 진행 중인 세션 개수 계산
            const activeCount = sessions.filter(s => 
              s.resourceId === resInfo.id && 
              !s.checkOutAt &&
              // 예약과 연결된 세션만 (혹은 해당 자원 전체 세션)
              reservations.some(r => r.id === s.reservationId && r.date === keyOf(now))
            ).length;
            const isFull = activeCount >= policy.capacity;
            
            return (
              <div className="mb-6 rounded-[14px] p-4 text-white relative overflow-hidden" style={{ background: isFull ? "var(--mob-busy-bg)" : "var(--mob-free-bg)", margin: "6px 0", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                <div className="flex items-center gap-2 mb-2 relative z-10">
                  <span className={\`w-2.5 h-2.5 rounded-full \${isFull ? "glow-dot-busy" : "glow-dot-free"}\`} />
                  <span className="text-[18px] font-bold" style={{ color: isFull ? "var(--mob-busy-text)" : "var(--mob-free-text)" }}>
                    {isFull ? "지금 만석입니다" : \`\${policy.capacity - activeCount}자리 남았습니다\`}
                  </span>
                </div>
                <div className="text-[13px] font-medium mb-3" style={{ color: isFull ? "var(--mob-busy-text)" : "var(--mob-free-text)", opacity: 0.8 }}>
                  정원 {policy.capacity}명 · 지금 {activeCount}명 이용 중
                </div>
                
                <OccupancyBar capacity={policy.capacity} current={activeCount} />
                
                <div className="relative z-10 mt-5">
                  <button className="w-full py-2.5 rounded-[10px] text-[13px] font-bold bg-black/20 text-white" onClick={() => {
                    if (isFull) {
                      showToast("알림이 설정되었습니다."); // 자리 나면 알림 받기 stub
                    } else {
                      tryCreate(roomId, defStart(), selKey);
                    }
                  }}>
                    {isFull ? "자리 나면 알림 받기" : "지금 바로 예약하기"}
                  </button>
                </div>
              </div>
            );
          } else {
            // 단일 자원 (Meeting Room)
            return (
              <div className="mb-6 rounded-[14px] p-4 text-white relative overflow-hidden" style={{ background: mobCurrentMtg ? "var(--mob-busy-bg)" : "var(--mob-free-bg)", margin: "6px 0", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                <div className="flex items-center gap-2 mb-2 relative z-10">
                  <span className={\`w-2.5 h-2.5 rounded-full \${mobCurrentMtg ? "glow-dot-busy" : "glow-dot-free"}\`} />
                  <span className="text-[18px] font-bold" style={{ color: mobCurrentMtg ? "var(--mob-busy-text)" : "var(--mob-free-text)" }}>{mobCurrentMtg ? "지금 회의 중" : "지금 비어있음"}</span>
                </div>
                <div className="text-[13px] font-medium mb-5" style={{ color: mobCurrentMtg ? "var(--mob-busy-text)" : "var(--mob-free-text)", opacity: 0.8 }}>
                  {mobCurrentMtg ? \`\${mobCurrentMtg.title} · \${mobCurrentMtg.end} 종료\` : mobNextMtg ? \`\${mobNextMtg.start}까지 사용 가능\` : "오늘 남은 시간 계속 사용 가능"}
                </div>
                <div className="relative z-10">
                  {mobCurrentMtg ? (
                    canEdit(mobCurrentMtg) ? (
                      <div className="flex gap-2">
                        <select 
                          onChange={(e) => { if (e.target.value) { extendRes(mobCurrentMtg, parseInt(e.target.value)); e.target.value = ""; } }} 
                          className="flex-1 py-2.5 rounded-[10px] text-[13px] font-bold bg-black/20 text-white text-center cursor-pointer outline-none appearance-none"
                        >
                          <option value="" hidden>회의 연장</option>
                          <option value="5" style={{color: "#000"}}>+ 5분</option>
                          <option value="10" style={{color: "#000"}}>+ 10분</option>
                          <option value="15" style={{color: "#000"}}>+ 15분</option>
                          <option value="30" style={{color: "#000"}}>+ 30분</option>
                        </select>
                        <button className="flex-1 py-2.5 rounded-[10px] text-[13px] font-bold bg-black/20 text-white" onClick={() => completeRes(mobCurrentMtg)}>
                          회의 종료
                        </button>
                      </div>
                    ) : (
                      <button className="w-full py-2.5 rounded-[10px] text-[13px] font-bold bg-black/20 text-white" onClick={() => requireAuth(() => setDetail(mobCurrentMtg), "댓글을 남기려면 로그인이 필요해요.")}>
                        댓글 남기기
                      </button>
                    )
                  ) : (
                    <button className="w-full py-2.5 rounded-[10px] text-[13px] font-bold bg-black/20 text-white" onClick={() => tryCreate(roomId, defStart(), selKey)}>
                      지금 바로 예약하기
                    </button>
                  )}
                </div>
              </div>
            );
          }
        })()}
        
        {/* Detail List */}`;

code = code.replace(statusCardRegex, newStatusCardCode);


// 7. Auto-cancel 노쇼 로직 추가 (useEffect 내부)
const effectCode = `
  // 노쇼 방지 (Auto-Cancel)
  useEffect(() => {
    if (!resources.length || !reservations.length || !sessions.length) return;
    
    const interval = setInterval(() => {
      const currentTime = new Date();
      reservations.forEach(r => {
        if (r.status !== 'booked') return;
        
        const resPolicy = resources.find(res => res.id === (r.resourceId || 'meeting-room'))?.policy;
        if (!resPolicy || !resPolicy.autoCancelMinutes) return;
        
        const [y, m, d] = r.date.split('-').map(Number);
        const [hh, mm] = r.start.split(':').map(Number);
        const startDt = new Date(y, m - 1, d, hh, mm);
        
        const elapsedMins = (currentTime - startDt) / (1000 * 60);
        if (elapsedMins > resPolicy.autoCancelMinutes) {
          // check if session exists
          const hasSession = sessions.some(s => s.reservationId === r.id);
          if (!hasSession) {
            updateDoc(doc(db, "reservations", r.id), { status: 'cancelled' }).catch(console.error);
          }
        }
      });
    }, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, [resources, reservations, sessions]);
`;

code = code.replace('useEffect(() => {\n    window.scrollTo(0, 0);\n  }, [roomId]);', 'useEffect(() => {\n    window.scrollTo(0, 0);\n  }, [roomId]);\n' + effectCode);

// 8. Workroom reservation allowOverlap 우회
const checkConflictRegex = /const checkConflict =.*?return conflicts.length > 0;\n  };/s;
const checkConflictCode = `const checkConflict = (roomId, date, s, e, ignoreId = null) => {
    const resInfo = resources.find(r => r.id === (roomId === 'workroom' ? 'workroom' : 'meeting-room'));
    const isOverlapAllowed = resInfo?.policy?.allowOverlap;
    const capacity = resInfo?.policy?.capacity || 1;

    const conflicts = reservations.filter(
      (r) => r.roomId === roomId && r.date === date && r.status === "booked" && r.id !== ignoreId && toMin(s) < toMin(r.end) && toMin(e) > toMin(r.start)
    );

    if (isOverlapAllowed) {
      return conflicts.length >= capacity;
    }
    return conflicts.length > 0;
  };`;
code = code.replace(checkConflictRegex, checkConflictCode);

// 9. When booking, inject resourceId correctly
const tryCreateOriginal = `setForm({ id: "", roomId: rid, date: d, start: s, end: nextSlot(s), title: "", attendees: [user], color: "gray", isUrgent: false, comments: [] });`;
const tryCreateModified = `const resId = rid === 'workroom' ? 'workroom' : 'meeting-room';
    setForm({ id: "", roomId: rid, resourceId: resId, date: d, start: s, end: nextSlot(s), title: "", attendees: [user], color: "gray", isUrgent: false, comments: [] });`;
code = code.replace(tryCreateOriginal, tryCreateModified);

// Write changes
fs.writeFileSync(appPath, code, 'utf8');
console.log('App.jsx patched successfully for Step 3.');
