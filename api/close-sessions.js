import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc, serverTimestamp, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyB-4Eu769Zen7p__ZTrepFDuZfTvyIMYww",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "promptshot-d0190.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "promptshot-d0190",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "promptshot-d0190.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "784599297882",
  appId: process.env.FIREBASE_APP_ID || "1:784599297882:web:521015f79e9e1bb0f50d63"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default async function handler(req, res) {
  try {
    const sessionsRef = collection(db, 'sessions');
    
    // 진행 중인 세션들(autoClosed가 아직 처리되지 않은 항목 중 checkOutAt이 없는 것)
    const q = query(sessionsRef, where('autoClosed', '==', false));
    const snapshot = await getDocs(q);
    
    let closedCount = 0;
    const promises = [];

    snapshot.forEach((d) => {
      const data = d.data();
      // 명세서 조건: checkOutAt이 없는 세션을 닫고 autoClosed: true 남김
      if (!data.checkOutAt) {
        promises.push(
          updateDoc(doc(db, 'sessions', d.id), {
            checkOutAt: serverTimestamp(),
            autoClosed: true
          })
        );
        closedCount++;
      }
    });

    await Promise.all(promises);

    res.status(200).json({ success: true, message: `Closed ${closedCount} active sessions.` });
  } catch (error) {
    console.error('Error closing sessions:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
