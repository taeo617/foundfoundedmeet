import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyALsGTWeB1MUfkXQOsHuA4E2wVOh9tZ_iI",
  authDomain: "foundfounded-7cd3e.firebaseapp.com",
  projectId: "foundfounded-7cd3e",
  storageBucket: "foundfounded-7cd3e.firebasestorage.app",
  messagingSenderId: "705068371976",
  appId: "1:705068371976:web:546b664ff9b87d99eac1bd",
  measurementId: "G-G0DR5QJZY0"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

console.log("Attempting to GET registered_users_list...");
db.collection('prompts').doc('registered_users_list').get()
  .then(doc => {
    console.log("GET SUCCESS!");
    console.log("Exists:", doc.exists);
    console.log("Data:", doc.data());
    
    console.log("\nAttempting to LISTEN to registered_users_list...");
    const unsubscribe = db.collection('prompts').doc('registered_users_list').onSnapshot(snap => {
      console.log("LISTEN SUCCESS!");
      console.log("Data:", snap.data());
      unsubscribe();
      process.exit(0);
    }, err => {
      console.error("LISTEN FAILED:", err);
      process.exit(1);
    });
  })
  .catch(err => {
    console.error("GET FAILED:", err);
    process.exit(1);
  });
