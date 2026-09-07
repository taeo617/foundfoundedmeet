import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  try {
    let rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
    rawKey = rawKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n').trim();
    
    const serviceAccount = {
      projectId: (process.env.FIREBASE_PROJECT_ID || "promptshot-d0190").trim(),
      clientEmail: (process.env.FIREBASE_CLIENT_EMAIL || "").trim(),
      privateKey: rawKey,
    };
    initializeApp({ credential: cert(serviceAccount) });
  } catch (error) {
    console.error("Firebase Admin initialization error:", error);
  }
}

const db = getFirestore();

// 자정(한국시간 00:00)에 체크아웃을 잊은 세션을 닫습니다.
//
// 예전 쿼리 `where('autoClosed', '==', false)` 는 한 번도 동작한 적이 없습니다.
// 세션을 만드는 handleStartSession 이 autoClosed 필드를 넣지 않았고, Firestore 에서
// "필드 없음" 은 false 와 매칭되지 않기 때문입니다. autoClosed:false 는 finishSession
// 이 checkOutAt 과 함께 넣었으므로, 쿼리에 걸리는 문서는 전부 이미 닫힌 것뿐이었습니다.
//
// 그래서 지금은 최근 30일 세션을 checkInAt 기준으로 읽고 코드에서 checkOutAt 없는
// 것을 고릅니다. 하루 1회, 수백 건 이하라 읽기 비용은 무시할 수준입니다.
const LOOKBACK_DAYS = 30;
// 3D 프린터는 24시간·주말 예약이 가능해 밤새 출력이 정상 상황입니다. 자정에 강제로
// 닫으면 사용 기록이 틀어지므로, 프린터 세션은 24시간이 지난 것만 닫습니다.
const PRINTER_GRACE_MS = 24 * 60 * 60 * 1000;
const isPrinter = (resourceId) => String(resourceId || '').startsWith('bambu');

export default async function handler(req, res) {
  try {
    const sessionsRef = db.collection('sessions');
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const snapshot = await sessionsRef.where('checkInAt', '>=', since).get();

    const now = Date.now();
    let closedCount = 0;
    let skippedPrinters = 0;
    const promises = [];

    snapshot.forEach((d) => {
      const data = d.data() || {};
      if (data.checkOutAt) return;

      const checkIn = data.checkInAt && typeof data.checkInAt.toMillis === 'function'
        ? data.checkInAt.toMillis()
        : null;
      if (isPrinter(data.resourceId) && checkIn !== null && now - checkIn < PRINTER_GRACE_MS) {
        skippedPrinters++;
        return;
      }

      promises.push(
        d.ref.update({
          checkOutAt: FieldValue.serverTimestamp(),
          autoClosed: true
        })
      );
      closedCount++;
    });

    await Promise.all(promises);

    res.status(200).json({
      success: true,
      scanned: snapshot.size,
      closed: closedCount,
      skippedPrinters,
      message: `Closed ${closedCount} active sessions.`
    });
  } catch (error) {
    console.error('Error closing sessions:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
