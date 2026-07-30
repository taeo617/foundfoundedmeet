import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const KEY_PATH = "c:/Users/User/Desktop/ffm-backup/serviceAccountKey.json";
const serviceAccount = JSON.parse(fs.readFileSync(KEY_PATH, "utf8"));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const kkokduReservation = {
  "id": "r_1785288820412_138644",
  "roomId": "big",
  "title": "꼭두 리뉴얼 리뷰",
  "date": "2026-07-29",
  "start": "17:00",
  "end": "17:30",
  "attendees": [
    "m7",
    "m15",
    "m1",
    "m2",
    "m13"
  ],
  "repeat": false,
  "color": "yellow",
  "isUrgent": false,
  "comments": [],
  "owner": "경선",
  "checkedIn": [],
  "resourceId": "meeting-room" // 추가된 마이그레이션 필드 포함
};

(async () => {
  try {
    await db.collection("reservations").doc(kkokduReservation.id).set(kkokduReservation);
    console.log("✅ 유실된 [꼭두 리뉴얼 리뷰] 예약 문서를 성공적으로 복구했습니다!");
    process.exit(0);
  } catch (err) {
    console.error("복구 에러:", err);
    process.exit(1);
  }
})();
