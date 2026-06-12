import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import webpush from 'web-push';
import { Expo } from 'expo-server-sdk';
import { MEMBERS, FLOW_TEAM_KEYS } from './flowTeamKeys.js';

const firebaseConfig = {
  apiKey: "AIzaSyALsGTWeB1MUfkXQOsHuA4E2wVOh9tZ_iI",
  authDomain: "foundfounded-7cd3e.firebaseapp.com",
  projectId: "foundfounded-7cd3e",
  storageBucket: "foundfounded-7cd3e.firebasestorage.app",
  messagingSenderId: "705068371976",
  appId: "1:705068371976:web:546b664ff9b87d99eac1bd",
  measurementId: "G-G0DR5QJZY0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Initialize Web Push
webpush.setVapidDetails(
  'mailto:example@yourdomain.org',
  process.env.VITE_VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

// Initialize Expo
const expo = new Expo();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { title, body, url, attendees } = req.body;

    if (!attendees || attendees.length === 0) {
      return res.status(200).json({ success: true, message: 'No attendees to notify.' });
    }

    // 1. Get tokens from users collection
    const usersRef = collection(db, 'users');
    const chunks = [];
    for (let i = 0; i < attendees.length; i += 10) {
      chunks.push(attendees.slice(i, i + 10));
    }

    let webTokens = [];
    let expoTokens = [];

    for (const chunk of chunks) {
      const q = query(usersRef, where('id', 'in', chunk));
      const snapshot = await getDocs(q);
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.webPushSubscription) webTokens.push(data.webPushSubscription); // legacy support
        if (data.webPushSubscriptions && Array.isArray(data.webPushSubscriptions)) {
          webTokens.push(...data.webPushSubscriptions);
        }
        if (data.expoPushToken) expoTokens.push(data.expoPushToken);
      });
    }

    // 2. Send Web Push
    const uniqueWebTokens = [];
    const seenEndpoints = new Set();
    for (const token of webTokens) {
      if (token && token.endpoint && !seenEndpoints.has(token.endpoint)) {
        seenEndpoints.add(token.endpoint);
        uniqueWebTokens.push(token);
      }
    }

    const webPushPromises = uniqueWebTokens.map(sub => {
      const payload = JSON.stringify({ title, body, url });
      return webpush.sendNotification(sub, payload).catch(err => {
        console.error('Web push error:', err);
      });
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
      expoPushPromises.push(
        expo.sendPushNotificationsAsync(chunk).catch(err => {
          console.error('Expo push error:', err);
        })
      );
    }

    // 4. Send Flow.team Notifications
    const flowApiKey = process.env.FLOW_API_KEY;
    const flowBotId = process.env.FLOW_BOT_ID;
    let flowPromises = [];

    if (flowApiKey && flowBotId) {
      const flowMessage = `${title} | ${body}`;
      
      const empKeys = attendees.map(id => {
        const member = MEMBERS.find(m => m.id === id);
        return member ? FLOW_TEAM_KEYS[member.name] : null;
      }).filter(Boolean);

      flowPromises = empKeys.map(empKey => {
        return fetch('https://api.flow.team/v1/bot/notifications', {
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
        }).catch(err => console.error('Flow push error:', err));
      });
    }

    await Promise.all([...webPushPromises, ...expoPushPromises, ...flowPromises]);

    res.status(200).json({ success: true, sentWeb: webTokens.length, sentExpo: expoTokens.length, sentFlow: flowPromises.length });
  } catch (error) {
    console.error('Push notification error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
