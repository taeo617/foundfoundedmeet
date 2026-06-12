import re

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add "긴급 회의" toggle in form UI
urgent_ui = """                <div className="flex items-center gap-2 mt-4">
                  <input type="checkbox" id="isUrgent" checked={form.isUrgent} onChange={(e) => setForm({ ...form, isUrgent: e.target.checked })} className="accent-red-500 w-4 h-4" />
                  <label htmlFor="isUrgent" className="text-sm font-medium" style={{ color: "#C0392B" }}>긴급 회의 (기존 회의를 뒤로 밀어냅니다)</label>
                </div>"""

# Find where 'form.title' is bound and insert this right before or after it.
# Actually, the form has a div with "회의 제목". Let's inject after the title input.
content = re.sub(r'(placeholder="회의 목적을 간단히 적어주세요\." />\s*</div>)', r'\1\n' + urgent_ui, content)


# 2. Modify colors for Urgent meetings
# In Track:
track_replace = """          const top = ((toMin(r.start) - DAY_START) / STEP) * PX, h = ((toMin(r.end) - toMin(r.start)) / STEP) * PX, p = r.isUrgent ? pal('red') : pal('green'), mine = isMine(r);"""
content = re.sub(r'const top =.*?\).*?mine = isMine\(r\);', track_replace, content)

# In Calendar cells:
cell_replace = """                          {list.slice(0, view === "week" ? 10 : 3).map((r) => { const p = r.isUrgent ? pal('red') : pal('green'); return ("""
content = re.sub(r'\{list\.slice\(0, view === "week" \? 10 : 3\)\.map\(\(r\) => \{ const p = pal\(r\.color\); return \(', cell_replace, content)

# In My reservations list:
myres_replace = """              <div className="grid gap-3">
                {myRes.map((r) => { const p = r.isUrgent ? pal('red') : pal('green'), rm = ROOMS.find((x) => x.id === r.roomId), [y, mo, da] = r.date.split("-").map(Number), d = new Date(y, mo - 1, da); return ("""
content = content.replace('{myRes.map((r) => { const p = pal(r.color), rm = ROOMS.find((x) => x.id === r.roomId), [y, mo, da] = r.date.split("-").map(Number), d = new Date(y, mo - 1, da); return (', myres_replace.replace('<div className="grid gap-3">\n', '').strip())

myres_all_replace = """              <div className="grid gap-3">
                {myResAll.map((r) => { const p = r.isUrgent ? pal('red') : pal('green'), rm = ROOMS.find((x) => x.id === r.roomId), [y, mo, da] = r.date.split("-").map(Number), d = new Date(y, mo - 1, da); return ("""
content = content.replace('{myResAll.map((r) => { const p = pal(r.color), rm = ROOMS.find((x) => x.id === r.roomId), [y, mo, da] = r.date.split("-").map(Number), d = new Date(y, mo - 1, da); return (', myres_all_replace.replace('<div className="grid gap-3">\n', '').strip())

# 3. Add Comments UI to the Detail modal
# Find <div className="mt-4 flex flex-wrap items-center gap-1.5"> (Attendees list)
# and append the comments section right after.
comments_ui = """            {/* Comments Section */}
            <div className="mt-6 border-t pt-4" style={{ borderColor: C.border }}>
              <div className="text-sm font-semibold mb-2">코멘트</div>
              <div className="flex flex-col gap-2 mb-3 max-h-32 overflow-y-auto">
                {detail.comments && detail.comments.map((c, i) => (
                  <div key={i} className="text-xs bg-gray-50 rounded p-2">
                    <span className="font-bold mr-1">{c.author}:</span>
                    <span>{c.text}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input id="newComment" className="inp flex-1 text-xs px-2 py-1.5 border rounded-lg" placeholder="코멘트 남기기" onKeyDown={(e) => {
                  if(e.key === 'Enter') {
                    const txt = e.target.value.trim();
                    if(txt && user) {
                      const newComments = [...(detail.comments || []), { author: user, text: txt }];
                      setDetail({ ...detail, comments: newComments });
                      e.target.value = '';
                      // Save to DB and notify
                      if(isFirebaseConfigured) {
                        updateDoc(doc(db, "reservations", detail.id), { comments: newComments }).then(() => {
                           const atts = detail.attendees.filter(a => a !== getMeId());
                           sendPushNotification('💬 새 코멘트가 달렸어요', `${user}: ${txt.substring(0,20)}...`, atts);
                        });
                      } else {
                        setReservations(prev => prev.map(r => r.id === detail.id ? { ...r, comments: newComments } : r));
                      }
                    }
                  }
                }} />
                <button onClick={() => {
                  const input = document.getElementById('newComment');
                  const txt = input.value.trim();
                  if(txt && user) {
                    const newComments = [...(detail.comments || []), { author: user, text: txt }];
                    setDetail({ ...detail, comments: newComments });
                    input.value = '';
                    if(isFirebaseConfigured) {
                      updateDoc(doc(db, "reservations", detail.id), { comments: newComments }).then(() => {
                         const atts = detail.attendees.filter(a => a !== getMeId());
                         sendPushNotification('💬 새 코멘트가 달렸어요', `${user}: ${txt.substring(0,20)}...`, atts);
                      });
                    } else {
                      setReservations(prev => prev.map(r => r.id === detail.id ? { ...r, comments: newComments } : r));
                    }
                  }
                }} className="px-3 py-1.5 bg-black text-white rounded-lg text-xs font-semibold">등록</button>
              </div>
            </div>"""

content = re.sub(r'(<div className="mt-4 flex flex-wrap items-center gap-1\.5">.*?</div>)', r'\1\n' + comments_ui, content, flags=re.DOTALL)

# 4. Modify Extension Logic to warn and send Trigger 2
extend_logic_new = """  function extendRes(r, mins) {
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
  }"""
content = re.sub(r'function extendRes\(r, mins\).*?\}, "회의를 연장하려면 로그인이 필요해요\."\);[\s]*\}', extend_logic_new, content, flags=re.DOTALL)

# 5. Add /install route in section
install_ui = """
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
"""
content = content.replace('{section === "mine" && (', install_ui + '\n        {section === "mine" && (')

# Add "앱 설치" to NAV
content = content.replace('const NAV = [["book", "예약", CalendarDays], ["mine", "내 예약", List]];', 'const NAV = [["book", "예약", CalendarDays], ["mine", "내 예약", List], ["install", "앱 설치", Download]];')

# 6. Add "iOS Add to Home screen banner" logic
ios_banner_logic = """
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
"""
content = content.replace('const [dayEventsDate, setDayEventsDate] = useState(null);', ios_banner_logic + '\nconst [dayEventsDate, setDayEventsDate] = useState(null);')

ios_banner_ui = """
      {showIosBanner && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex justify-between items-center z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.1)]">
          <div className="text-sm">
            <b>iOS 앱으로 설치</b><br/><span className="text-xs text-gray-500">Safari 공유 버튼 ➔ '홈 화면에 추가'</span>
          </div>
          <button onClick={() => setShowIosBanner(false)} className="text-gray-400 p-2"><X size={18}/></button>
        </div>
      )}
"""
content = content.replace('{/* ===== Header ===== */}', ios_banner_ui + '\n      {/* ===== Header ===== */}')


with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
