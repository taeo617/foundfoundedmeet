import re

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add VAPID key constant
vapid_key_code = """
const VAPID_PUBLIC_KEY = "BHcev4VX3785teMaRQaNp7ahP5w1TxBt2kUoOwnJaaGEXOXz3nTAj54oSVSh4rHg92bq5uASXttZyDyzUF3R8E4";

async function subscribeToWebPush(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js');
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY
      });
      // Save subscription to user document in Firestore
      if (isFirebaseConfigured) {
        await setDoc(doc(db, "users", userId), { id: userId, webPushSubscription: JSON.parse(JSON.stringify(subscription)) }, { merge: true });
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
"""

content = content.replace('/* ===================== shared atoms ===================== */', vapid_key_code + '\n/* ===================== shared atoms ===================== */')

# 2. Call subscribeToWebPush when user logs in
do_login_code = """  function doLogin(name) { 
    setReservations((p) => p.map((r) => (r.owner === "나" ? { ...r, owner: name } : r))); 
    setUser(name); 
    setAuthOpen(false); 
    const meId = MEMBERS.find((m) => m.name === name)?.id;
    if (meId) {
      subscribeToWebPush(meId);
    }
  }"""

content = re.sub(r'function doLogin\(name\).*?setAuthOpen\(false\); }', do_login_code, content, flags=re.DOTALL)

# 3. Add isUrgent to form state
content = content.replace('repeat: false, color: "yellow"', 'repeat: false, color: "yellow", isUrgent: false, comments: []')

# 4. Rewrite saveForm for overlaps and urgent pushing
saveForm_new = """  async function saveForm() {
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
      alert(`선택하신 참석자 중 해당 시간에 이미 다른 회의가 예약되어 있는 멤버가 있습니다:\\n\\n${conflicts.join("\\n")}\\n\\n시간을 변경하거나 참석자 조정을 해주세요.`);
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
  }"""

content = re.sub(r'async function saveForm\(\) \{.*?(?=  function cancelRes)', saveForm_new + '\n', content, flags=re.DOTALL)


# 5. Add Expo Message event listener to window
expo_listener_code = """
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
"""
content = content.replace('const [dayEventsDate, setDayEventsDate] = useState(null);', 'const [dayEventsDate, setDayEventsDate] = useState(null);\n' + expo_listener_code)
content = content.replace('setUser(name);', 'setUser(name); localStorage.setItem("last_user", name);')

# 6. Add "Add to Home Screen" instructions UI and /install route UI
# Wait, /install is a route. Let's just use section === "install".

# 7. Write back
with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
