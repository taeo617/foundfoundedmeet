import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import webpush from 'web-push';
import fs from 'fs';

// Load .env.local variables
if (fs.existsSync('.env.local')) {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      process.env[key] = value.trim();
    }
  });
}

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

async function testPush() {
  const publicKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  console.log('Using Public Key:', publicKey);
  console.log('Using Private Key:', privateKey ? 'LOADED' : 'MISSING');

  if (!publicKey || !privateKey) {
    console.error('VAPID Keys are missing in process.env!');
    return;
  }

  webpush.setVapidDetails(
    'mailto:example@yourdomain.org',
    publicKey,
    privateKey
  );

  console.log('Fetching m1 user token...');
  const userDoc = await getDoc(doc(db, 'users', 'm1'));
  if (!userDoc.exists()) {
    console.error('User m1 not found in Firestore.');
    return;
  }

  const userData = userDoc.data();
  const sub = userData.webPushSubscription;
  if (!sub) {
    console.error('User m1 does not have a webPushSubscription.');
    return;
  }

  console.log('Sending direct Web Push to m1...');
  const payload = JSON.stringify({
    title: '🚨 Direct Test Notification',
    body: 'If you see this, direct web push is working!',
    url: '/'
  });

  try {
    const res = await webpush.sendNotification(sub, payload);
    console.log('SUCCESS! Push service response status:', res.statusCode);
  } catch (err) {
    console.error('FAILED to send push notification:', err);
  }
}

testPush().then(() => process.exit(0)).catch(err => {
  console.error('Error running test:', err);
  process.exit(1);
});
