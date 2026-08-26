/*
 * When the service is allowed to send notifications.
 *
 *   화~금  09:00 – 21:00
 *   월요일  12:00 – 21:00   (월요일 오전은 늦게 시작하는 팀 사정)
 *   토·일   전면 무음
 *
 * Anything raised outside this window is dropped, not queued - including the
 * confirmation the sender sees on their own screen.
 *
 * NOTE: api/sendWindow.js holds an identical copy. The two bundles are built
 * separately, so keep them in sync by hand.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const CLOSE_HOUR = 21;
const OPEN_HOUR_DEFAULT = 9;
const OPEN_HOUR_MONDAY = 12;

export function sendWindow(at = new Date()) {
  const kst = new Date(at.getTime() + KST_OFFSET_MS);
  const day = kst.getUTCDay(); // 0 일요일 … 6 토요일
  const hour = kst.getUTCHours();

  if (day === 0 || day === 6) {
    return { open: false, reason: 'weekend', message: '주말에는 알림을 보내지 않습니다.' };
  }

  const openHour = day === 1 ? OPEN_HOUR_MONDAY : OPEN_HOUR_DEFAULT;
  if (hour < openHour || hour >= CLOSE_HOUR) {
    return {
      open: false,
      reason: 'quiet_hours',
      message: `알림 발송 시간이 아닙니다. (${openHour}시 ~ ${CLOSE_HOUR}시)`,
    };
  }

  return { open: true, openHour, closeHour: CLOSE_HOUR };
}
