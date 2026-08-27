import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { MEMBERS } from './flowTeamKeys.js';

/*
 * Server-side login.
 *
 * The PIN never reaches the browser bundle and the browser never decides who you
 * are: this endpoint checks the PIN against a server-only environment variable and
 * answers with a Firebase custom token. The client signs in with that token, so
 * Firestore rules see a real, verifiable identity (uid + name/role claims) instead
 * of an anonymous session that every visitor shares.
 */

function ensureApp() {
  if (!getApps().length) {
    let rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
    rawKey = rawKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n').trim();
    const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
    if (!clientEmail || !rawKey) return null;
    try {
      initializeApp({
        credential: cert({
          projectId: (process.env.FIREBASE_PROJECT_ID || 'promptshot-d0190').trim(),
          clientEmail,
          privateKey: rawKey,
        }),
      });
    } catch (e) {
      console.error('Firebase Admin init error:', e);
      return null;
    }
  }
  return getApps()[0] || null;
}

// Constant-time compare so a wrong PIN cannot be recovered by timing the response.
function pinMatches(input, expected) {
  if (!input || !expected) return false;
  const a = Buffer.from(String(input));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}


const CUSTOM_TOKEN_AUDIENCE =
  'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

function base64url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function servicePrivateKey() {
  return (process.env.FIREBASE_PRIVATE_KEY || '')
    .replace(/^"|"$/g, '')
    .replace(/\\n/g, '\n')
    .trim();
}

function createCustomToken(uid, claims) {
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = servicePrivateKey();
  if (!clientEmail || !privateKey) throw new Error('Service account credentials are missing.');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: CUSTOM_TOKEN_AUDIENCE,
    iat: now,
    exp: now + 3600, // Firebase caps custom tokens at one hour.
    uid: String(uid),
    claims: claims || {},
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer
    .sign(privateKey)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signingInput}.${signature}`;
}

const MAX_FAILURES = 8;
const WINDOW_MS = 10 * 60 * 1000;

// A 4-digit PIN is only 10,000 guesses, so unlimited attempts would be trivially
// brute-forced. Failures are counted per client IP in Firestore.
async function throttle(db, ip) {
  if (!db || !ip) return { blocked: false };
  const ref = db.collection('_authThrottle').doc(ip.replace(/[^\w.:-]/g, '_'));
  try {
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : null;
    const first = data?.firstFailureAt?.toMillis?.() ?? 0;
    const count = data?.count ?? 0;
    if (count >= MAX_FAILURES && Date.now() - first < WINDOW_MS) {
      return { blocked: true, retryInSec: Math.ceil((WINDOW_MS - (Date.now() - first)) / 1000) };
    }
    if (first && Date.now() - first >= WINDOW_MS) await ref.delete();
    return { blocked: false, ref };
  } catch (e) {
    console.error('throttle read error:', e);
    return { blocked: false };
  }
}

async function recordFailure(ref) {
  if (!ref) return;
  try {
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ count: 1, firstFailureAt: FieldValue.serverTimestamp() });
    } else {
      await ref.update({ count: FieldValue.increment(1) });
    }
  } catch (e) {
    console.error('throttle write error:', e);
  }
}

export default async function handler(req, res) {
  try {
    return await login(req, res);
  } catch (e) {
    console.error('login handler crashed:', e);
    return res.status(500).json({
      error: 'unhandled',
      message: '로그인 처리 중 서버 오류가 발생했습니다.',
      detail: String(e && e.message ? e.message : e).slice(0, 300),
      where: String((e && e.stack) || '').split('\n')[1]?.trim().slice(0, 200) || null,
    });
  }
}

async function login(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const app = ensureApp();
  if (!app) {
    return res.status(500).json({ error: 'server_misconfigured', message: '서버 인증 설정이 없습니다. 관리자에게 문의해주세요.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const rawName = String(body.name || '').trim();
  const pin = String(body.pin || '');
  if (!rawName || !pin) {
    return res.status(400).json({ error: 'missing_fields', message: '이름과 비밀번호를 입력해주세요.' });
  }

  const db = getFirestore();
  const ip = String(
    req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown'
  ).split(',')[0].trim();

  // 잠금 검사와 계정 상태 조회는 서로 무관하므로 동시에 던집니다.
  // 순차로 돌리면 콜드스타트에 왕복 한 번이 그대로 더해집니다.
  const lower0 = rawName.toLowerCase();
  const memberForStatus = (lower0 === 'admin' || lower0 === 'guest')
    ? null
    : MEMBERS.find((m) => m.name === rawName);
  const statusPromise = memberForStatus
    ? db.collection('users').doc(memberForStatus.id).get().catch(() => null)
    : Promise.resolve(null);

  const gate = await throttle(db, ip);
  if (gate.blocked) {
    return res.status(429).json({
      error: 'too_many_attempts',
      message: `로그인 시도가 너무 많습니다. ${Math.ceil(gate.retryInSec / 60)}분 후 다시 시도해주세요.`,
    });
  }

  const lower = rawName.toLowerCase();
  let uid = null;
  let displayName = null;
  let role = 'member';
  let expectedPin = null;

  if (lower === 'admin') {
    uid = 'admin';
    displayName = 'admin';
    role = 'admin';
    expectedPin = process.env.ADMIN_PIN;
  } else if (lower === 'guest') {
    uid = 'm_guest';
    displayName = 'Guest';
    role = 'guest';
    expectedPin = process.env.GUEST_PIN;
  } else {
    // Shared accounts that live in the client constants but not in the server
    // member list. They behave like the admin account in the app already.
    const EXTRA = {
      '회의실': { id: 'm_room', role: 'admin' },
      '클라이언트': { id: 'm_client', role: 'member' },
    };
    const extra = EXTRA[rawName];
    if (extra) {
      uid = extra.id;
      displayName = rawName;
      role = extra.role;
      expectedPin = process.env.MEMBER_PIN;
    }
  }

  if (!uid) {
    const member = MEMBERS.find((m) => m.name === rawName);
    if (!member) {
      await recordFailure(gate.ref);
      return res.status(401).json({ error: 'unknown_member', message: '등록되지 않은 멤버 이름입니다.' });
    }
    // The Firestore user document is the source of truth for suspension/deletion,
    // so a blocked account cannot log in by editing the client. (already in flight)
    try {
      const snap = await statusPromise;
      const data = snap && snap.exists ? snap.data() : {};
      const suspended = data.active === false || data.deleted === true || member.inactive === true;
      if (suspended) {
        return res.status(403).json({ error: 'account_disabled', message: '해당 계정은 사용할 수 없습니다. 관리자에게 문의해주세요.' });
      }
    } catch (e) {
      console.error('member status check failed:', e);
    }
    uid = member.id;
    displayName = member.name;
    role = member.group === 'director' ? 'director' : 'member';
    expectedPin = process.env.MEMBER_PIN;
  }

  if (!expectedPin) {
    console.error(`Missing PIN env var for role "${role}".`);
    return res.status(500).json({ error: 'server_misconfigured', message: '서버 인증 설정이 없습니다. 관리자에게 문의해주세요.' });
  }

  if (!pinMatches(pin, expectedPin)) {
    await recordFailure(gate.ref);
    return res.status(401).json({ error: 'bad_pin', message: '비밀번호가 올바르지 않아요.' });
  }

  try {
    if (gate.ref) await gate.ref.delete().catch(() => {});
    const token = createCustomToken(uid, { name: displayName, role });
    return res.status(200).json({ token, name: displayName, role, uid });
  } catch (e) {
    console.error('createCustomToken failed:', e);
    return res.status(500).json({ error: 'token_failed', message: '로그인 처리 중 오류가 발생했습니다.' });
  }
}
