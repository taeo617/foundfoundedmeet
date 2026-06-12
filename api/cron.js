import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyALsGTWeB1MUfkXQOsHuA4E2wVOh9tZ_iI",
  authDomain: "foundfounded-7cd3e.firebaseapp.com",
  projectId: "foundfounded-7cd3e",
  storageBucket: "foundfounded-7cd3e.firebasestorage.app",
  messagingSenderId: "705068371976",
  appId: "1:705068371976:web:546b664ff9b87d99eac1bd",
  measurementId: "G-G0DR5QJZY0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const pad = (n) => String(n).padStart(2, "0");
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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

    snapshot.forEach((doc) => {
      const data = doc.data();
      const endMin = toMin(data.end);
      
      // If the meeting ends exactly 5 minutes from now
      // Since cron might run at xx:01 or xx:00, we check a 1-minute window
      if (endMin - nowMin === 5) {
        if (data.attendees) {
          data.attendees.forEach(att => targetAttendees.add(att));
        }
        endingRooms.push(data.roomId === 'big' ? '큰 회의실' : '작은 회의실');
      }
    });

    if (targetAttendees.size === 0) {
      return res.status(200).json({ success: true, message: 'No meetings ending in 5 minutes.' });
    }

    // Call our own notify API
    const host = req.headers.host;
    const protocol = host.includes('localhost') ? 'http' : 'https';
    
    const notifyReq = await fetch(`${protocol}://${host}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '⏰ 회의 종료 5분 전이에요',
        body: `${endingRooms.join(', ')} 회의가 곧 끝나요. 마무리 부탁드려요 :)`,
        url: '/',
        attendees: Array.from(targetAttendees)
      })
    });

    const notifyRes = await notifyReq.json();
    res.status(200).json({ success: true, notified: notifyRes });
  } catch (error) {
    console.error('Cron error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
