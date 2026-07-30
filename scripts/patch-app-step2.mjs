import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.join(__dirname, '../src/App.jsx');

let code = fs.readFileSync(appPath, 'utf8');

// 1. Add imports
code = code.replace(
  'import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, arrayUnion, runTransaction } from "firebase/firestore";',
  'import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, arrayUnion, runTransaction, serverTimestamp, addDoc } from "firebase/firestore";'
);
code = code.replace(
  'import { useResources } from "./hooks/useResources";',
  'import { useResources } from "./hooks/useResources";\nimport { useSessions } from "./hooks/useSessions";'
);
code = code.replace(
  /Clock, User, LogIn, ChevronLeft, ChevronRight, X, UserPlus, FileText, CheckCircle2, AlertCircle, Plus, Info, Bell, Settings, Moon, Sun, Monitor, Menu, Edit2, ArrowUp, ShieldAlert, LogOut/g,
  'Clock, User, LogIn, ChevronLeft, ChevronRight, X, UserPlus, FileText, CheckCircle2, AlertCircle, Plus, Info, Bell, Settings, Moon, Sun, Monitor, Menu, Edit2, ArrowUp, ShieldAlert, LogOut, Play, Square'
);

// 2. Add useSessions and activeSession logic to App
code = code.replace(
  'const { resources } = useResources();',
  `const { resources } = useResources();\n  const { sessions } = useSessions();\n  const activeSession = user ? sessions.find(s => !s.checkOutAt && s.userId === user) : null;\n\n  const handleStartSession = async (res) => {\n    try {\n      await addDoc(collection(db, "sessions"), {\n        resourceId: res.resourceId || "meeting-room",\n        userId: user,\n        reservationId: res.id,\n        checkInAt: serverTimestamp(),\n        autoClosed: false,\n        source: "button"\n      });\n      showToast("사용을 시작했습니다.");\n      setDetail(null);\n    } catch (e) {\n      console.error(e);\n      showToast("오류가 발생했습니다.");\n    }\n  };\n\n  const handleEndSession = async (sessionId) => {\n    try {\n      await updateDoc(doc(db, "sessions", sessionId), {\n        checkOutAt: serverTimestamp()\n      });\n      showToast("사용을 종료했습니다.");\n      setDetail(null);\n    } catch (e) {\n      console.error(e);\n      showToast("오류가 발생했습니다.");\n    }\n  };`
);

// 3. Add Global Indicator in Header
code = code.replace(
  '<div className="hidden md:flex items-center gap-2">',
  `<div className="hidden md:flex items-center gap-2">\n            {activeSession && (\n              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold mr-2 cursor-pointer hover:opacity-80 transition-opacity" style={{ background: "var(--mob-free-bg)", color: "white" }} onClick={() => {\n                const r = reservations.find(x => x.id === activeSession.reservationId);\n                if (r) setDetail(r);\n              }}>\n                <Play size={12} fill="currentColor" /> 이용 중\n              </div>\n            )}`
);
// Also for mobile view (around line 2410 where hamburger menu is)
code = code.replace(
  '<button onClick={() => setMobileMenuOpen(true)} className="md:hidden p-2 rounded-lg" style={{ color: C.text }}><Menu size={20} /></button>',
  `{activeSession && (\n              <div className="md:hidden flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold mr-1 cursor-pointer" style={{ background: "var(--mob-free-bg)", color: "white" }} onClick={() => {\n                const r = reservations.find(x => x.id === activeSession.reservationId);\n                if (r) setDetail(r);\n              }}>\n                <Play size={10} fill="currentColor" /> 이용 중\n              </div>\n            )}\n            <button onClick={() => setMobileMenuOpen(true)} className="md:hidden p-2 rounded-lg" style={{ color: C.text }}><Menu size={20} /></button>`
);

// 4. Add Buttons to Detail Modal
code = code.replace(
  '{/* 🚨 중요 사용 요청 */}',
  `{/* 🟢 사용 시작/종료 버튼 */}\n            {(() => {\n              if (!user) return null;\n              const isAttendeeOrOwner = detail.owner === user || detail.attendees.includes(user);\n              if (!isAttendeeOrOwner) return null;\n\n              const activeDetailSession = sessions.find(s => s.reservationId === detail.id && !s.checkOutAt);\n              \n              if (activeDetailSession) {\n                return (\n                  <div className="mt-4 border-t pt-4" style={{ borderColor: C.border }}>\n                    <button onClick={() => handleEndSession(activeDetailSession.id)} className="lift flex w-full items-center justify-center gap-1.5 rounded-lg py-3 text-[14px] font-bold shadow-sm" style={{ background: PASTEL.red.bg, color: PASTEL.red.text }}>\n                      <Square size={16} fill="currentColor" /> 사용 종료\n                    </button>\n                  </div>\n                );\n              } else {\n                if (detail.date === keyOf(now)) {\n                  return (\n                    <div className="mt-4 border-t pt-4" style={{ borderColor: C.border }}>\n                      <button onClick={() => handleStartSession(detail)} className="lift flex w-full items-center justify-center gap-1.5 rounded-lg py-3 text-[14px] font-bold shadow-sm text-white" style={{ background: "var(--mob-free-bg)" }}>\n                        <Play size={16} fill="currentColor" /> 사용 시작\n                      </button>\n                    </div>\n                  );\n                }\n              }\n              return null;\n            })()}\n            \n            {/* 🚨 중요 사용 요청 */}`
);

fs.writeFileSync(appPath, code, 'utf8');
console.log('App.jsx patched successfully for Step 2.');
