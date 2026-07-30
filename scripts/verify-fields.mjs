import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const KEY_PATH = 'c:/Users/User/Desktop/ffm-backup/serviceAccountKey.json';
const serviceAccount = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

db.collection('reservations').doc('r_1785288820412_138644').get().then(doc => {
  if (doc.exists) {
    const d = doc.data();
    console.log('--- DB에 저장된 실제 값 ---');
    console.log('id: "' + d.id + '"');
    console.log('attendees: ' + JSON.stringify(d.attendees));
    console.log('owner: "' + d.owner + '"');
    console.log('checkedIn: ' + JSON.stringify(d.checkedIn));
    console.log('문서 키(Doc ID): "' + doc.id + '"');
  } else {
    console.log('문서가 없습니다.');
  }
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
