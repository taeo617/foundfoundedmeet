import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import webpush from 'web-push';
import { Expo } from 'expo-server-sdk';
import crypto from 'crypto';
import { MEMBERS, FLOW_TEAM_KEYS } from './flowTeamKeys.js';

function getDb() {
  if (!getApps().length) {
    try {
      let rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
      rawKey = rawKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n').trim();
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

      if (clientEmail && rawKey) {
        const serviceAccount = {
          projectId: (process.env.FIREBASE_PROJECT_ID || "promptshot-d0190").trim(),
          clientEmail: (process.env.FIREBASE_CLIENT_EMAIL || "").trim(),
          privateKey: rawKey,
        };
        initializeApp({ credential: cert(serviceAccount) });
      }
    } catch (error) {
      console.error("Firebase Admin initialization error:", error);
    }
  }

  if (getApps().length) {
    try {
      return getFirestore();
    } catch (e) {
      console.error("getFirestore error:", e);
    }
  }
  return null;
}

const FALLBACK_VAPID_PRIVATE = 'hj0hR-pyhTTRuWeULgxSXP2dj7dgFdXAME47KYtVDOk';

// The public key is DERIVED from the private key so the two can never drift apart.
// (A mismatched pair makes every push fail with 403 VapidPkHashMismatch.)
function getVapidKeys() {
  const privateKey = (process.env.VAPID_PRIVATE_KEY || FALLBACK_VAPID_PRIVATE).trim();
  let publicKey = (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '').trim();
  try {
    const raw = Buffer.from(privateKey.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(raw);
    const derived = ecdh.getPublicKey('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (publicKey && publicKey !== derived) {
      console.warn('VAPID public key env var does not match the private key. Using the derived key instead.');
    }
    publicKey = derived;
  } catch (e) {
    console.error('VAPID key derivation error:', e);
  }
  return { publicKey, privateKey };
}

const expo = new Expo();

export default async function handler(req, res) {
  const q = req.query || {};

  // GET ?send=m6[,m7] fires a real test push at those users. Debug helper - the POST
  // route below is the one the app uses. Safe to delete once push is confirmed working.
  let bodyOverride = null;
  if (req.method === 'GET' && q.send) {
    bodyOverride = {
      title: q.title || '🔔 푸시 점검 테스트',
      body: q.msg || '이 알림이 보이면 서버 푸시가 정상 동작합니다.',
      url: '/',
      attendees: String(q.send).split(',').map(v => v.trim()).filter(Boolean),
      isRealtime: true,
    };
  }

  // GET is the source of truth for the client: it always subscribes with a key
  // this server actually holds the private half of.
  if (req.method === 'GET' && !bodyOverride) {
    const payload = { publicKey: getVapidKeys().publicKey };

    // ?diag=1 reports config health only (booleans + counts, no secrets).
    if (req.query && (req.query.diag === '1' || req.query.diag === 'true')) {
      const db = getDb();
      payload.diag = {
        dbReady: !!db,
        projectId: (process.env.FIREBASE_PROJECT_ID || 'promptshot-d0190').trim(),
        hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
        hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
        hasVapidPrivate: !!process.env.VAPID_PRIVATE_KEY,
        vapidPublicEnv: (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '').slice(0, 12) || null,
      };
      // Credential shape + live token test (no secret values are returned).
      try {
        let rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
        rawKey = rawKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n').trim();
        payload.diag.privateKey = {
          length: rawKey.length,
          startsWithPem: rawKey.startsWith('-----BEGIN PRIVATE KEY-----'),
          endsWithPem: rawKey.endsWith('-----END PRIVATE KEY-----'),
          newlineCount: (rawKey.match(/\n/g) || []).length,
          hasLiteralBackslashN: rawKey.includes('\\n'),
        };
        payload.diag.clientEmailDomain = String(process.env.FIREBASE_CLIENT_EMAIL || '').split('@')[1] || null;
      } catch (e) {}

      try {
        const app = getApps()[0];
        const token = await app.options.credential.getAccessToken();
        payload.diag.tokenTest = { ok: !!token?.access_token, expiresIn: token?.expires_in ?? null };
      } catch (e) {
        payload.diag.tokenTest = { ok: false, error: String(e?.message || e).slice(0, 300) };
      }

      if (db) {
        try {
          const snap = await db.collection('users').limit(50).get();
          payload.diag.userDocCount = snap.size;
          payload.diag.userDocIds = snap.docs.map(d => d.id);
          payload.diag.docsWithPush = snap.docs.filter(d => {
            const v = d.data() || {};
            return !!v.webPushSubscription || (Array.isArray(v.webPushSubscriptions) && v.webPushSubscriptions.length > 0);
          }).map(d => {
            const v = d.data() || {};
            return { id: d.id, count: (Array.isArray(v.webPushSubscriptions) ? v.webPushSubscriptions.length : 0) + (v.webPushSubscription ? 1 : 0) };
          });
        } catch (e) {
          payload.diag.readError = String(e?.message || e).slice(0, 200);
        }
      }
    }

    return res.status(200).json(payload);
  }

  if (req.method !== 'POST' && !bodyOverride) {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    try {
      const { publicKey, privateKey } = getVapidKeys();
      webpush.setVapidDetails('mailto:example@yourdomain.org', publicKey, privateKey);
    } catch (e) {
      console.error("Vapid key init error:", e);
    }

    let bodyObj = bodyOverride || req.body;
    if (typeof bodyObj === 'string') {
      try {
        bodyObj = JSON.parse(bodyObj);
      } catch (e) {}
    }
    bodyObj = bodyObj || {};

    const { title, body, url, attendees, isRealtime, directSubscription, excludeEndpoint, subscriptions } = bodyObj;

    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    const kstHour = kstDate.getUTCHours();
    const kstDay = kstDate.getUTCDay();

    // Cron reminders apply time restrictions; real-time user actions (isRealtime: true) skip quiet hours.
    if (!isRealtime) {
      if (kstDay === 0 || kstDay === 6) {
        return res.status(200).json({ success: true, message: '주말에는 정기 알림이 전송되지 않습니다.' });
      }

      if (kstDay === 1) {
        if (kstHour < 12 || kstHour >= 20) {
          return res.status(200).json({ success: true, message: '월요일 정기 알림 전송 시간이 아닙니다. (낮 12시 ~ 오후 8시)' });
        }
      } else {
        if (kstHour < 9 || kstHour >= 20) {
          return res.status(200).json({ success: true, message: '정기 알림 전송 시간이 아닙니다. (오전 9시 ~ 오후 8시)' });
        }
      }
    }

    let webTokens = [];
    let expoTokens = [];

    if (directSubscription) {
      webTokens.push(directSubscription);
    }
    // Subscriptions the signed-in client already resolved from Firestore. This keeps
    // push working even if the server's Firebase Admin credentials are unavailable.
    if (Array.isArray(subscriptions)) {
      webTokens.push(...subscriptions);
    }

    const db = getDb();
    const usersRef = db ? db.collection('users') : null;
    const ownerByEndpoint = new Map();

    const resolvedAttendees = new Set();
    (attendees || []).forEach(att => {
      if (!att) return;
      resolvedAttendees.add(String(att).trim());
      const member = MEMBERS.find(m => m.id === att || m.name === att);
      if (member) {
        resolvedAttendees.add(String(member.id).trim());
        resolvedAttendees.add(String(member.name).trim());
      }
    });
    const uniqueAttendees = Array.from(resolvedAttendees).filter(Boolean);
    const foundDocIds = new Set();

    const collectFromDoc = (doc) => {
      const data = doc.data() || {};
      const push = (sub) => {
        if (!sub) return;
        webTokens.push(sub);
        let parsed = sub;
        if (typeof parsed === 'string') {
          try { parsed = JSON.parse(parsed); } catch (e) { return; }
        }
        if (parsed && parsed.endpoint && !ownerByEndpoint.has(parsed.endpoint)) {
          ownerByEndpoint.set(parsed.endpoint, { docId: doc.id, raw: sub });
        }
      };
      push(data.webPushSubscription);
      if (Array.isArray(data.webPushSubscriptions)) data.webPushSubscriptions.forEach(push);
      if (data.expoPushToken) expoTokens.push(data.expoPushToken);
    };

    // 1. Query by Document ID directly (e.g. 'm16')
    if (usersRef && uniqueAttendees.length > 0) {
      try {
        const docSnaps = await Promise.all(uniqueAttendees.map(id => usersRef.doc(String(id)).get()));
        docSnaps.forEach((doc) => {
          if (doc.exists) {
            foundDocIds.add(doc.id);
            collectFromDoc(doc);
          }
        });
      } catch (dbErr) {
        console.error("Firestore doc query error:", dbErr);
      }
    }

    // 1b. Fallback: Query by field 'id' or 'name' for any missed attendees
    const missingAttendees = uniqueAttendees.filter(id => !foundDocIds.has(String(id)));
    if (usersRef && missingAttendees.length > 0) {
      const chunks = [];
      for (let i = 0; i < missingAttendees.length; i += 10) {
        chunks.push(missingAttendees.slice(i, i + 10));
      }

      for (const chunk of chunks) {
        if (!chunk || chunk.length === 0) continue;
        try {
          const [byFieldSnap, byNameSnap] = await Promise.all([
            usersRef.where('id', 'in', chunk).get(),
            usersRef.where('name', 'in', chunk).get()
          ]);
          byFieldSnap.forEach(collectFromDoc);
          byNameSnap.forEach(collectFromDoc);
        } catch (queryErr) {
          console.error("Firestore fallback query error:", queryErr);
        }
      }
    }

    // 2. Send Web Push
    const uniqueWebTokens = [];
    const seenEndpoints = new Set();
    for (let token of webTokens) {
      if (!token) continue;
      if (typeof token === 'string') {
        try {
          token = JSON.parse(token);
        } catch (e) {}
      }
      if (!token || typeof token !== 'object' || !token.endpoint) continue;
      // The sending device already displayed this notification itself.
      if (excludeEndpoint && token.endpoint === excludeEndpoint) continue;
      if (!seenEndpoints.has(token.endpoint)) {
        seenEndpoints.add(token.endpoint);
        uniqueWebTokens.push(token);
      }
    }

    const deadEndpoints = [];
    const webResults = [];

    const webPushPromises = uniqueWebTokens.map(async sub => {
      try {
        const payload = JSON.stringify({ title, body, url });
        const r = await webpush.sendNotification(sub, payload, {
          TTL: 86400,
          headers: { 'Urgency': 'high' }
        });
        webResults.push({ endpoint: String(sub.endpoint).slice(0, 60), statusCode: r?.statusCode || 201 });
        return r;
      } catch (err) {
        const statusCode = err?.statusCode;
        console.error('Web push error:', statusCode || '', err?.body || err?.message || err);
        webResults.push({
          endpoint: String(sub.endpoint).slice(0, 60),
          statusCode: statusCode || 0,
          error: String(err?.body || err?.message || err).slice(0, 200)
        });
        // 404/410 = the browser threw this subscription away.
        // 403 with a VAPID/JWT complaint = subscribed under a different key pair.
        // Either way the record is useless; purge it so the client re-subscribes cleanly.
        const errText = String(err?.body || err?.message || '');
        if (
          statusCode === 404 ||
          statusCode === 410 ||
          (statusCode === 403 && /vapid|hash|jwt|unauthor/i.test(errText))
        ) {
          deadEndpoints.push(sub.endpoint);
        }
        return null;
      }
    });

    // 3. Send Expo Push
    let messages = [];
    for (let pushToken of expoTokens) {
      if (!Expo.isExpoPushToken(pushToken)) {
        console.error(`Push token ${pushToken} is not a valid Expo push token`);
        continue;
      }
      messages.push({
        to: pushToken,
        sound: 'default',
        title: title,
        body: body,
        data: { url },
      });
    }

    let expoPushPromises = [];
    let expoChunks = expo.chunkPushNotifications(messages);
    for (let chunk of expoChunks) {
      expoPushPromises.push((async () => {
        try {
          return await expo.sendPushNotificationsAsync(chunk);
        } catch (err) {
          console.error('Expo push error:', err);
          return null;
        }
      })());
    }

    // 4. Send Flow.team Notifications
    const flowApiKey = process.env.FLOW_API_KEY;
    const flowBotId = process.env.FLOW_BOT_ID;
    let flowPromises = [];

    if (flowApiKey && flowBotId) {
      const flowMessage = `${title} | ${body}`;

      const empKeys = (attendees || []).map(id => {
        const member = MEMBERS.find(m => m.id === id);
        return member ? FLOW_TEAM_KEYS[member.name] : null;
      }).filter(Boolean);

      flowPromises = empKeys.map(async empKey => {
        try {
          return await fetch('https://api.flow.team/v1/bot/notifications', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${flowApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              botId: flowBotId,
              empKey: empKey,
              message: flowMessage
            })
          });
        } catch (err) {
          console.error('Flow push error:', err);
          return null;
        }
      });
    }

    await Promise.all([...webPushPromises, ...expoPushPromises, ...flowPromises]);

    // 5. Purge dead subscriptions so they stop polluting future sends
    if (usersRef && deadEndpoints.length > 0) {
      await Promise.all(deadEndpoints.map(async endpoint => {
        const owner = ownerByEndpoint.get(endpoint);
        if (!owner) return;
        try {
          const snap = await usersRef.doc(owner.docId).get();
          const data = snap.data() || {};
          const update = {};
          if (Array.isArray(data.webPushSubscriptions)) {
            update.webPushSubscriptions = data.webPushSubscriptions.filter(s => {
              let p = s;
              if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { return true; } }
              return p?.endpoint !== endpoint;
            });
          }
          let single = data.webPushSubscription;
          if (typeof single === 'string') { try { single = JSON.parse(single); } catch (e) {} }
          if (single?.endpoint === endpoint) update.webPushSubscription = FieldValue.delete();
          if (Object.keys(update).length) await usersRef.doc(owner.docId).set(update, { merge: true });
        } catch (e) {
          console.error('Failed to purge dead subscription:', e);
        }
      }));
    }

    res.status(200).json({
      success: true,
      dbReady: !!usersRef,
      attendeesTried: uniqueAttendees,
      matchedUsers: foundDocIds.size,
      sentWeb: uniqueWebTokens.length,
      excludedSelf: !!excludeEndpoint,
      sentExpo: expoTokens.length,
      sentFlow: flowPromises.length,
      purged: deadEndpoints.length,
      webResults
    });
  } catch (error) {
    console.error('Push notification error:', error);
    res.status(200).json({
      success: false,
      error: 'Push Notification Error',
      details: error?.message || String(error)
    });
  }
}
