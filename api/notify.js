import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import webpush from 'web-push';
import { Expo } from 'expo-server-sdk';
import { MEMBERS, FLOW_TEAM_KEYS } from './flowTeamKeys.js';

if (!getApps().length) {
  try {
    let rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
    rawKey = rawKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n').trim();
    
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID || "promptshot-d0190",
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: rawKey,
    };
    initializeApp({ credential: cert(serviceAccount) });
  } catch (error) {
    console.error("Firebase Admin initialization error:", error);
  }
}

const db = getFirestore();
const expo = new Expo();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    try {
      webpush.setVapidDetails(
        'mailto:example@yourdomain.org',
        process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '',
        process.env.VAPID_PRIVATE_KEY || ''
      );
    } catch(e) {
      console.error("Vapid key init error:", e);
    }

    const { title, body, url, attendees } = req.body;

    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    const kstHour = kstDate.getUTCHours();
    const kstDay = kstDate.getUTCDay();

    if (kstDay === 0 || kstDay === 6) {
      return res.status(200).json({ success: true, message: '주말에는 알림이 전송되지 않습니다.' });
    }

    if (kstDay === 1) {
      if (kstHour < 12 || kstHour >= 20) {
        return res.status(200).json({ success: true, message: '월요일 알림 전송 시간이 아닙니다. (낮 12시 ~ 오후 8시)' });
      }
    } else {
      if (kstHour < 9 || kstHour >= 20) {
        return res.status(200).json({ success: true, message: '알림 전송 시간이 아닙니다. (오전 9시 ~ 오후 8시)' });
      }
    }

    if (!attendees || attendees.length === 0) {
      return res.status(200).json({ success: true, message: 'No attendees to notify.' });
    }

    const usersRef = db.collection('users');
    const chunks = [];
    for (let i = 0; i < attendees.length; i += 10) {
      chunks.push(attendees.slice(i, i + 10));
    }

    let webTokens = [];
    let expoTokens = [];

    for (const chunk of chunks) {
      const snapshot = await usersRef.where('id', 'in', chunk).get();
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.webPushSubscription) webTokens.push(data.webPushSubscription);
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
