import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { MEMBERS } from './flowTeamKeys.js';
import { sendWindow } from './sendWindow.js';

/*
 * Time-based reminders. Meant to be called every 5 minutes by an external
 * scheduler (cron-job.org), because Vercel's Hobby plan only allows one cron
 * run per day.
 *
 *   시작 5분 전   회의가 곧 시작됩니다
 *   종료 5분 전   자리를 비워주세요
 *   오늘 일정      그날 첫 발송 가능 시각에 한 번
 *
 * Every reservation carries a flag once notified, so a scheduler that fires
 * twice - or a run that overlaps the next one - cannot send the same reminder
 * again.
 */

const LEAD_MINUTES = 5;

function getDb() {
  if (!getApps().length) {
    try {
      let rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
      rawKey = rawKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n').trim();
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      if (clientEmail && rawKey) {
        initializeApp({
          credential: cert({
            projectId: (process.env.FIREBASE_PROJECT_ID || 'promptshot-d0190').trim(),
            clientEmail: clientEmail.trim(),
            privateKey: rawKey,
          }),
        });
      }
    } catch (error) {
      console.error('Firebase Admin initialization error:', error);
    }
  }
  if (getApps().length) {
    try { return getFirestore(); } catch (e) { console.error('getFirestore error:', e); }
  }
  return null;
}

const pad = (n) => String(n).padStart(2, '0');
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const keyOf = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

const ROOM_NAMES = {
  big: '큰 회의실',
  small: '작은 회의실',
  workroom: '워크룸',
  'bambu-1': '968 (LEFT)',
  'bambu-2': '990 (RIGHT)',
};
const roomName = (id) => ROOM_NAMES[id] || '공간';

// Attendees are stored as ids in some places and names in others, so collect both.
function addIdentifiers(set, value) {
  if (!value) return;
  set.add(String(value));
  const m = MEMBERS.find((x) => x.id === value || x.name === value);
  if (m) {
    set.add(String(m.id));
    set.add(String(m.name));
  }
}

function collectPeople(set, data) {
  if (Array.isArray(data.attendees)) data.attendees.forEach((a) => addIdentifiers(set, a));
  addIdentifiers(set, data.owner);
  addIdentifiers(set, data.who);
  addIdentifiers(set, data.userId);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // The scheduler is a public URL, so require a shared secret. Without it anyone
  // could replay reminders at will.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const supplied =
      (req.query && req.query.key) ||
      String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (supplied !== secret) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  try {
    const db = getDb();
    if (!db) {
      return res.status(200).json({ success: false, message: 'Server DB Admin not initialized.' });
    }

    // Heartbeat. Recorded on every call - including calls skipped for quiet hours -
    // so it is always possible to tell whether the scheduler is actually alive.
    // Without this, a scheduler that quietly stopped looks identical to a quiet day.
    const stateRef = db.collection('_cronState').doc('daily');
    try {
      await stateRef.set({ lastRunAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch (e) {
      console.error('heartbeat write failed:', e);
    }

    const win = sendWindow();
    if (!win.open) {
      return res.status(200).json({ success: true, skipped: win.reason, message: win.message });
    }

    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayStr = keyOf(kst);
    const nowMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();

    const resRef = db.collection('reservations');
    const snapshot = await resRef.where('date', '==', todayStr).get();

    const startingPeople = new Set();
    const endingPeople = new Set();
    const morningPeople = new Set();
    const startingLabels = [];
    const endingLabels = [];
    const flagWrites = [];

    snapshot.forEach((doc) => {
      const data = doc.data() || {};
      if (data.status === 'cancelled') return;
      if (!data.start || !data.end) return;

      collectPeople(morningPeople, data);

      const startDelta = toMin(data.start) - nowMin;
      if (startDelta >= 0 && startDelta <= LEAD_MINUTES && !data.notifiedStart) {
        collectPeople(startingPeople, data);
        startingLabels.push(`[${roomName(data.roomId || data.resourceId)}] ${data.title || '일정'}`);
        flagWrites.push(doc.ref.update({ notifiedStart: true }));
      }

      const endDelta = toMin(data.end) - nowMin;
      if (endDelta >= 0 && endDelta <= LEAD_MINUTES && !data.notifiedEnd) {
        collectPeople(endingPeople, data);
        endingLabels.push(roomName(data.roomId || data.resourceId));
        flagWrites.push(doc.ref.update({ notifiedEnd: true }));
      }
    });

    // The daily digest fires on the first run of the day inside the send window.
    let sendMorning = false;
    try {
      const stateSnap = await stateRef.get();
      const lastDigest = stateSnap.exists ? stateSnap.data().lastDigestDate : null;
      if (lastDigest !== todayStr && morningPeople.size > 0) {
        sendMorning = true;
        await stateRef.set({ lastDigestDate: todayStr }, { merge: true });
      }
    } catch (e) {
      console.error('digest state error:', e);
    }

    if (!startingPeople.size && !endingPeople.size && !sendMorning) {
      return res.status(200).json({ success: true, message: 'No reminders due.', nowMin });
    }

    // Claim the flags before sending so a duplicate run cannot resend.
    await Promise.all(flagWrites).catch((e) => console.error('flag write error:', e));

    const host = req.headers.host;
    const protocol = host && host.includes('localhost') ? 'http' : 'https';
    const post = (payload) =>
      fetch(`${protocol}://${host}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: '/', ...payload }),
      })
        .then((r) => r.json())
        .catch((e) => ({ error: String(e && e.message ? e.message : e) }));

    const jobs = [];

    if (startingPeople.size > 0) {
      jobs.push(post({
        title: '🚀 일정 시작 5분 전이에요',
        body: `${startingLabels.join(', ')} 일정이 곧 시작됩니다. 준비해주세요!`,
        attendees: Array.from(startingPeople),
      }));
    }

    if (endingPeople.size > 0) {
      jobs.push(post({
        title: '⏰ 일정 종료 5분 전이에요',
        body: `${endingLabels.join(', ')} 이용 시간이 곧 끝납니다. 마무리 부탁드려요 :)`,
        attendees: Array.from(endingPeople),
      }));
    }

    if (sendMorning) {
      jobs.push(post({
        title: '📅 오늘 예정된 일정이 있어요',
        body: '오늘 예약 일정이 있습니다. 앱에서 캘린더를 확인해 보세요!',
        attendees: Array.from(morningPeople),
      }));
    }

    const results = await Promise.all(jobs);
    res.status(200).json({
      success: true,
      nowMin,
      starting: startingPeople.size,
      ending: endingPeople.size,
      digest: sendMorning,
      results,
    });
  } catch (error) {
    console.error('Cron error:', error);
    res.status(500).json({ error: 'Internal Server Error', details: String(error && error.message) });
  }
}
