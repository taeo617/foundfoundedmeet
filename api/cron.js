import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB-4Eu769Zen7p__ZTrepFDuZfTvyIMYww",
  authDomain: "promptshot-d0190.firebaseapp.com",
  projectId: "promptshot-d0190",
  storageBucket: "promptshot-d0190.firebasestorage.app",
  messagingSenderId: "784599297882",
  appId: "1:784599297882:web:521015f79e9e1bb0f50d63",
  measurementId: "G-SPHLBD59S1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const pad = (n) => String(n).padStart(2, "0");
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const keyOf = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const now = new Date();
    // Vercel server time is UTC. We need KST (UTC+9).
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    
    const todayStr = keyOf(kstDate);
    const nowMin = kstDate.getUTCHours() * 60 + kstDate.getUTCMinutes(); // Since we added kstOffset to the epoch time, getUTCHours() will give us KST hours.

    // Query today's reservations
    const resRef = collection(db, 'reservations');
    const q = query(resRef, where('date', '==', todayStr));
    const snapshot = await getDocs(q);
    
    const targetAttendees = new Set();
    const endingRooms = [];
    const morningAttendees = new Set();
    
    // 월요일은 12시(720분), 화~금은 오전 9시(540분)
    const isMonday = kstDate.getUTCDay() === 1;
    const morningTime = isMonday ? 720 : 540;

    snapshot.forEach((doc) => {
      const data = doc.data();
      const endMin = toMin(data.end);
      
      // 당일 첫 알림 시간에 오늘 회의 참석자 모두 수집
      if (nowMin === morningTime) {
        if (data.attendees) {
          data.attendees.forEach(att => morningAttendees.add(att));
        }
      }

      // If the meeting ends exactly 5 minutes from now
      // Since cron might run at xx:01 or xx:00, we check a 1-minute window
      if (endMin - nowMin === 5) {
        if (data.attendees) {
          data.attendees.forEach(att => targetAttendees.add(att));
        }
        endingRooms.push(data.roomId === 'big' ? '큰 회의실' : '작은 회의실');
      }
    });

    if (targetAttendees.size === 0 && morningAttendees.size === 0) {
      return res.status(200).json({ success: true, message: 'No meetings ending in 5 minutes and not morning notification time.' });
    }

    // Call our own notify API
    const host = req.headers.host;
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const notifyPromises = [];
    
    if (targetAttendees.size > 0) {
      notifyPromises.push(
        fetch(`${protocol}://${host}/api/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: '⏰ 회의 종료 5분 전이에요',
            body: `${endingRooms.join(', ')} 회의가 곧 끝나요. 마무리 부탁드려요 :)`,
            url: '/',
            attendees: Array.from(targetAttendees)
          })
        }).then(res => res.json())
      );
    }

    if (nowMin === morningTime && morningAttendees.size > 0) {
      notifyPromises.push(
        fetch(`${protocol}://${host}/api/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: '📅 오늘 예정된 회의가 있어요',
            body: '오늘 회의 일정이 있습니다. 앱에서 캘린더를 확인해 보세요!',
            url: '/',
            attendees: Array.from(morningAttendees)
          })
        }).then(res => res.json())
      );
    }

    const notifyRes = await Promise.all(notifyPromises);
    res.status(200).json({ success: true, notified: notifyRes });
  } catch (error) {
    console.error('Cron error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
