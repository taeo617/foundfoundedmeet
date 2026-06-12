import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function checkUsers() {
  console.log('Fetching users from Firestore...');
  const snapshot = await getDocs(collection(db, 'users'));
  if (snapshot.empty) {
    console.log('No users found in the database.');
    return;
  }
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`User Document ID: ${doc.id}`);
    console.log(`- ID field: ${data.id}`);
    console.log(`- WebPushSubscription:`, data.webPushSubscription ? 'PRESENT' : 'MISSING');
    if (data.webPushSubscription) {
      console.log(`  Old Endpoint: ${data.webPushSubscription.endpoint}`);
    }
    if (data.webPushSubscriptions) {
      console.log(`  New Array count: ${data.webPushSubscriptions.length}`);
    }
  });
}

checkUsers().then(() => process.exit(0)).catch(err => {
  console.error('Error fetching users:', err);
  process.exit(1);
});
