import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { MEMBERS } from './flowTeamKeys.js';
import { sendWindow } from './sendWindow.js';

/*
 * Time-based reminders. Meant to be called every 5 minutes by an external
 * scheduler (cron-job.org), because Vercel's Hobby plan only allows one cron
 * run per day.
 *
 *   시작 5분 전   회의가 곧 시작됩니다        → 참석자 + 등록자
 *   종료 5분 전   자리를 비워주세요            → 참석자 + 등록자
 *   종료 5분 전   (큰 회의실 한정)             → 회의실 계정, 다음 일정까지 안내
 *   오늘 일정      그날 첫 발송 가능 시각에 한 번 → 그날 일정이 있는 사람 전원
 *
 * Every meeting carries a flag once notified, so a scheduler that fires
 * twice - or a run that overlaps the next one - cannot send the same reminder
 * again.
 */

// 시작/종료 몇 분 전에 알릴지. 조건이 (0, LEAD] 인 것에 주의하세요. 정각(delta 0)을
// 포함하면 이미 시작했거나 끝난 일정에 "5분 전" 이라고 알리게 됩니다.
const LEAD_MINUTES = 5;

// 회의실 계정은 큰 회의실에 걸어둔 화면 전용입니다. 종료 5분 전 알림 하나만 받고
// 시작 알림 / 오늘 일정 요약 / 예약 등록·변경 알림은 받지 않습니다.
const ROOM_ACCOUNT_ID = 'm_room';
const ROOM_ACCOUNT_NAME = '회의실';
const ROOM_ACCOUNT_ROOM = 'big';

// 공지사항은 등록하고 5분이 지나도 살아 있을 때만 전원에게 알립니다. 오타를 고치거나
// 잘못 올려 바로 지운 공지 때문에 열몇 명에게 푸시가 나가는 일을 막는 유예 시간입니다.
const ANNOUNCE_DELAY_MS = 5 * 60 * 1000;

// 공지 수신 대상. 회의실 화면 / 게스트 / 클라이언트 계정은 제외합니다.
const BROADCAST_TARGETS = MEMBERS
  .map((m) => m.id)
  .filter((id) => !['m_guest', 'm_client', 'm_room'].includes(id));

// "이어서 다음 일정이 있어요" 로 안내할 최대 공백. 두 시간 뒤 일정을 "이어서" 라고
// 부르면 지금 당장 비켜야 하는 것처럼 읽혀서 오해를 부릅니다.
const NEXT_GAP_MINUTES = 30;

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
const toHHMM = (min) => `${pad(Math.floor((min % 1440) / 60))}:${pad(min % 60)}`;
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

/*
 * 예약 한 건은 30분짜리 슬롯 문서 여러 개로 쪼개져 저장되고, groupId 로 묶여 있습니다.
 * 슬롯을 그대로 두고 판단하면 두 시간짜리 회의에 시작 알림이 네 번, 종료 알림이 네 번
 * 나갑니다. 그래서 알림을 판단하기 전에 groupId 로 다시 하나의 회의로 합칩니다.
 *
 * 대표 문서는 가장 이른 슬롯입니다. 알림 발송 플래그도 이 문서에만 씁니다.
 */
export function groupIntoMeetings(snapshot) {
  const meetings = new Map();

  snapshot.forEach((doc) => {
    const data = doc.data() || {};
    if (data.status === 'cancelled') return;
    if (!data.start || !data.end) return;

    const key = data.groupId || doc.id;
    const startMin = toMin(data.start);
    let endMin = toMin(data.end);
    // 자정에 끝나는 슬롯은 end 가 "00:00" 으로 저장되어 0 이 됩니다.
    if (endMin <= startMin) endMin += 1440;

    const existing = meetings.get(key);
    if (!existing) {
      meetings.set(key, {
        key,
        data,
        ref: doc.ref,
        startMin,
        endMin,
        roomId: data.roomId || data.resourceId || null,
        title: data.title || '일정',
      });
      return;
    }

    if (startMin < existing.startMin) {
      existing.startMin = startMin;
      existing.data = data;
      existing.ref = doc.ref;
      existing.roomId = data.roomId || data.resourceId || existing.roomId;
      existing.title = data.title || existing.title;
    }
    if (endMin > existing.endMin) existing.endMin = endMin;
  });

  return Array.from(meetings.values());
}

// 같은 공간에서 이 회의가 끝난 직후에 시작하는 회의. 공백이 NEXT_GAP_MINUTES 를
// 넘으면 "이어서" 가 아니므로 없는 것으로 봅니다.
export function findNextMeeting(meetings, roomId, endMin, excludeKey) {
  if (!roomId) return null;
  const candidates = meetings
    .filter((m) => m.roomId === roomId && m.key !== excludeKey && m.startMin >= endMin)
    .sort((a, b) => a.startMin - b.startMin);
  const next = candidates[0];
  if (!next) return null;
  if (next.startMin - endMin > NEXT_GAP_MINUTES) return null;
  return next;
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
    const meetings = groupIntoMeetings(snapshot);

    const startingPeople = new Set();
    const endingPeople = new Set();
    const morningPeople = new Set();
    const startingLabels = [];
    const endingLabels = [];
    const flagWrites = [];
    // 회의실 계정은 회의마다 다음 일정 안내가 달라지므로 한 건씩 따로 보냅니다.
    const roomAccountMessages = [];

    meetings.forEach((meeting) => {
      const data = meeting.data;
      collectPeople(morningPeople, data);

      const startDelta = meeting.startMin - nowMin;
      if (startDelta > 0 && startDelta <= LEAD_MINUTES && !data.notifiedStart) {
        collectPeople(startingPeople, data);
        startingLabels.push(`[${roomName(meeting.roomId)}] ${meeting.title}`);
        flagWrites.push(meeting.ref.update({ notifiedStart: true }));
      }

      const endDelta = meeting.endMin - nowMin;
      if (endDelta > 0 && endDelta <= LEAD_MINUTES && !data.notifiedEnd) {
        collectPeople(endingPeople, data);
        endingLabels.push(roomName(meeting.roomId));
        flagWrites.push(meeting.ref.update({ notifiedEnd: true }));

        if (meeting.roomId === ROOM_ACCOUNT_ROOM) {
          const next = findNextMeeting(meetings, meeting.roomId, meeting.endMin, meeting.key);
          roomAccountMessages.push({
            title: `⏰ ${roomName(meeting.roomId)} 종료 5분 전`,
            body: next
              ? `5분 후 종료됩니다. 이어서 ${toHHMM(next.startMin)}부터 '${next.title}' 일정이 예정되어 있어요.`
              : '5분 후 종료됩니다.',
          });
        }
      }
    });

    // 회의실 계정은 위에서 만든 전용 알림만 받습니다. 참석자 명단에 섞여 들어왔더라도
    // 시작 / 종료 / 오늘 일정 알림에서는 빼둡니다.
    [startingPeople, endingPeople, morningPeople].forEach((set) => {
      set.delete(ROOM_ACCOUNT_ID);
      set.delete(ROOM_ACCOUNT_NAME);
    });

    // 등록 5분이 지난 미발송 공지를 모읍니다. notified 필드가 아예 없는 옛 공지는
    // '== false' 에 걸리지 않으므로, 예전 공지가 뒤늦게 전원에게 나갈 일은 없습니다.
    const pendingAnnouncements = [];
    try {
      const annSnap = await db.collection('announcements').where('notified', '==', false).get();
      const cutoff = Date.now() - ANNOUNCE_DELAY_MS;
      annSnap.forEach((doc) => {
        const data = doc.data() || {};
        const title = String(data.title || '').trim();
        const text = String(data.text || '').trim();
        if (!title && !text) return;
        if (typeof data.createdAt !== 'number' || data.createdAt > cutoff) return;
        pendingAnnouncements.push({ ref: doc.ref, title, text });
      });
    } catch (e) {
      console.error('announcement query error:', e);
    }

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

    if (!startingPeople.size && !endingPeople.size && !sendMorning && !roomAccountMessages.length && !pendingAnnouncements.length) {
      return res.status(200).json({ success: true, message: 'No reminders due.', nowMin, meetings: meetings.length });
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

    roomAccountMessages.forEach((msg) => {
      jobs.push(post({ ...msg, attendees: [ROOM_ACCOUNT_ID] }));
    });

    if (pendingAnnouncements.length > 0) {
      // 보내기 전에 먼저 표시합니다. 다음 회차가 겹쳐 돌아도 같은 공지가 두 번 나가지 않습니다.
      await Promise.all(pendingAnnouncements.map((a) => a.ref.update({ notified: true })))
        .catch((e) => console.error('announcement flag write error:', e));

      pendingAnnouncements.forEach((a) => {
        // 불릿 표시용 "- " 는 알림 본문에서는 가운뎃점으로 바꿔 읽기 편하게 둡니다.
        const body = (a.text || a.title)
          .split('\n')
          .map((line) => line.trim().replace(/^[-•*]\s+/, '· '))
          .filter(Boolean)
          .join(' ');
        jobs.push(post({
          title: a.title ? `📢 ${a.title}` : '📢 공지사항이 업데이트됐어요',
          body: body.length > 120 ? `${body.slice(0, 120)}...` : body,
          attendees: BROADCAST_TARGETS,
        }));
      });
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
      meetings: meetings.length,
      starting: startingPeople.size,
      ending: endingPeople.size,
      roomAccount: roomAccountMessages.length,
      announcements: pendingAnnouncements.length,
      digest: sendMorning,
      results,
    });
  } catch (error) {
    console.error('Cron error:', error);
    res.status(500).json({ error: 'Internal Server Error', details: String(error && error.message) });
  }
}
