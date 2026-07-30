import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const KEY_PATH = "c:/Users/User/Desktop/ffm-backup/serviceAccountKey.json";
const serviceAccount = JSON.parse(fs.readFileSync(KEY_PATH, "utf8"));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const expected = {
  "id": "r_1785288820412_138644",
  "roomId": "big",
  "title": "꼭두 리뉴얼 리뷰",
  "date": "2026-07-29",
  "start": "17:00",
  "end": "17:30",
  "attendees": ["m7", "m15", "m1", "m2", "m13"],
  "repeat": false,
  "color": "yellow",
  "isUrgent": false,
  "comments": [],
  "owner": "경선",
  "checkedIn": [],
  "resourceId": "meeting-room" // 1단계 마이그레이션 필수 필드
};

(async () => {
  try {
    const docRef = db.collection("reservations").doc("r_1785288820412_138644");
    const doc = await docRef.get();
    
    if (!doc.exists) {
      console.error("문서가 존재하지 않습니다!");
      process.exit(1);
    }
    
    const actual = doc.data();
    console.log("=== DB 실제 데이터 ===");
    console.log(JSON.stringify(actual, null, 2));

    let isMatch = true;
    for (const key of Object.keys(expected)) {
      if (JSON.stringify(expected[key]) !== JSON.stringify(actual[key])) {
        console.error(`불일치 발견! 필드 [${key}] - 예상: ${JSON.stringify(expected[key])}, 실제: ${JSON.stringify(actual[key])}`);
        isMatch = false;
      }
    }

    for (const key of Object.keys(actual)) {
      if (expected[key] === undefined) {
        console.error(`원치 않는 추가 필드 발견! 필드 [${key}] - 실제: ${JSON.stringify(actual[key])}`);
        isMatch = false;
      }
    }

    if (isMatch) {
      console.log("\n모든 필드(문서 ID, attendees 순서, owner 등)가 정확히 일치합니다!");
    } else {
      console.log("\n불일치가 발견되어 원본 데이터(+resourceId)로 다시 덮어씁니다...");
      await docRef.set(expected);
      console.log("덮어쓰기 완료!");
    }
    process.exit(0);
  } catch(e) {
    console.error("에러 발생:", e);
    process.exit(1);
  }
})();
