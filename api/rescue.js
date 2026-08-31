import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/*
 * 예약 복구용 점검 엔드포인트.
 *
 * 기본은 읽기 전용입니다. 되돌리기는 문서 id 를 하나하나 지정했을 때만 동작하고,
 * "그날 전부" 같은 일괄 복구는 일부러 만들지 않았습니다. 취소된 예약 중에는 사람이
 * 직접 취소한 것도 섞여 있어서, 싸잡아 되살리면 지운 예약이 되살아납니다.
 *
 *   GET /api/rescue?key=SECRET&date=2026-08-31            그날 예약 전부 (취소 포함)
 *   GET /api/rescue?key=SECRET&date=2026-08-31&room=workroom
 *   GET /api/rescue?key=SECRET&restore=id1,id2            지정한 문서만 booked 로 되돌림
 */

function getDb() {
  if (!getApps().length) {
    let rawKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/^"|"$/g, '').replace(/\\n/g, '\n').trim();
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    if (!clientEmail || !rawKey) return null;
    initializeApp({
      credential: cert({
        projectId: (process.env.FIREBASE_PROJECT_ID || 'promptshot-d0190').trim(),
        clientEmail: clientEmail.trim(),
        privateKey: rawKey,
      }),
    });
  }
  try { return getFirestore(); } catch (e) { console.error(e); return null; }
}

export default async function handler(req, res) {
  const q = req.query || {};
  const secret = process.env.CRON_SECRET;
  if (!secret || q.key !== secret) return res.status(401).json({ error: 'unauthorized' });

  const db = getDb();
  if (!db) return res.status(500).json({ error: 'admin not initialized' });

  try {
    // ── 되돌리기: 지정한 문서만 ──────────────────────────────
    if (q.restore) {
      const ids = String(q.restore).split(',').map(v => v.trim()).filter(Boolean);
      if (!ids.length) return res.status(400).json({ error: 'restore 에 문서 id 가 필요합니다' });
      if (ids.length > 200) return res.status(400).json({ error: '한 번에 200건까지만' });

      const results = [];
      for (const id of ids) {
        const ref = db.collection('reservations').doc(id);
        const snap = await ref.get();
        if (!snap.exists) { results.push({ id, ok: false, reason: 'not_found' }); continue; }
        const before = snap.data().status || null;
        if (before !== 'cancelled') { results.push({ id, ok: false, reason: 'not_cancelled', status: before }); continue; }
        await ref.update({ status: 'booked' });
        results.push({ id, ok: true, before, after: 'booked' });
      }
      return res.status(200).json({ restored: results.filter(r => r.ok).length, results });
    }

    // ── 조회: 읽기 전용 ─────────────────────────────────────
    const date = q.date;
    if (!date) return res.status(400).json({ error: 'date 가 필요합니다 (YYYY-MM-DD)' });

    const snap = await db.collection('reservations').where('date', '==', date).get();
    const rows = [];
    snap.forEach(doc => {
      const d = doc.data() || {};
      if (q.room && d.roomId !== q.room && d.resourceId !== q.room) return;
      rows.push({
        id: doc.id,
        groupId: d.groupId || null,
        room: d.roomId || d.resourceId || null,
        title: d.title || null,
        owner: d.owner || null,
        start: d.start || null,
        end: d.end || null,
        status: d.status || null,
      });
    });
    rows.sort((a, b) => String(a.start).localeCompare(String(b.start)) || String(a.id).localeCompare(String(b.id)));

    const byStatus = rows.reduce((m, r) => { m[r.status || 'null'] = (m[r.status || 'null'] || 0) + 1; return m; }, {});
    return res.status(200).json({ date, room: q.room || 'all', total: rows.length, byStatus, rows });
  } catch (error) {
    console.error('rescue error:', error);
    return res.status(500).json({ error: String(error && error.message) });
  }
}
