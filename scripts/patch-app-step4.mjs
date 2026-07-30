import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.join(__dirname, '../src/App.jsx');

let code = fs.readFileSync(appPath, 'utf8');

// 1. reservations useMemo 수정 (병합 로직 추가)
const useMemoRegex = /const reservations = useMemo\(\(\) => \{.*?\n  \}, \[rawReservations, now, today\]\);/s;
const newUseMemoCode = `const reservations = useMemo(() => {
    const todayKey = keyOf(today);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    
    // Step 4: Group slots by groupId
    const grouped = {};
    const legacy = [];
    
    rawReservations.forEach(r => {
      if (r.groupId) {
        if (!grouped[r.groupId]) grouped[r.groupId] = [];
        grouped[r.groupId].push(r);
      } else {
        legacy.push(r);
      }
    });
    
    const merged = Object.keys(grouped).map(gid => {
      const slots = grouped[gid];
      if (slots.length === 0) return null;
      
      // Sort slots by start time
      slots.sort((a, b) => toMin(a.start) - toMin(b.start));
      
      const first = slots[0];
      const last = slots[slots.length - 1];
      
      const activeSlots = slots.filter(s => s.status !== 'cancelled');
      const finalStatus = activeSlots.length > 0 ? activeSlots[0].status : 'cancelled';
      
      if (finalStatus === 'cancelled' && first.status !== 'cancelled') {
        first.status = 'cancelled';
      }
      
      return {
        ...first,
        id: gid,
        start: first.start,
        end: last.end,
        _slots: slots.map(s => s.id)
      };
    }).filter(Boolean);
    
    const combined = [...legacy, ...merged];

    return combined.map(r => {
      if (r.date) {
        const isPastDay = r.date < todayKey;
        const isTodayOver30Min = r.date === todayKey && nowMin >= (toMin(r.start) + 30);
        
        if (isPastDay || isTodayOver30Min) {
          const ownerId = MEMBERS.find(m => m.name === r.owner && m.id !== "m_room")?.id;
          const attendees = (r.attendees || []).filter(id => id !== "m_room");
          const currentCheckedIn = (r.checkedIn || []).filter(id => id !== "m_room");
          
          if (!r.status || r.status === "booked") {
            return { ...r, status: "done", ownerId, attendees, checkedIn: currentCheckedIn };
          }
        }
      }
      return r;
    });
  }, [rawReservations, now, today]);`;

code = code.replace(useMemoRegex, newUseMemoCode);

// 2. submitRes 로직 변경
const submitResOriginal = `const docId = f.id || nid();
      const cleanedCheckedIn = (f.checkedIn || []).filter(id => cleanedAttendees.includes(id));
      const finalForm = { ...f, id: docId, title: f.title.trim(), owner: f.owner || user, attendees: cleanedAttendees, checkedIn: cleanedCheckedIn };
      
      if (isFirebaseConfigured) {
        await setDoc(doc(db, "reservations", docId), finalForm);
        for (const pushed of pushedReservations) {
          await updateDoc(doc(db, "reservations", pushed.id), { start: pushed.start, end: pushed.end });
        }
      }`;

const submitResModified = `const groupId = f.id || \`grp_\${Date.now()}_\${Math.random().toString(36).substr(2, 5)}\`;
      const cleanedCheckedIn = (f.checkedIn || []).filter(id => cleanedAttendees.includes(id));
      const ownerId = MEMBERS.find(m => m.name === (f.owner || user))?.id || "admin";
      const finalForm = { ...f, id: groupId, groupId: groupId, title: f.title.trim(), owner: f.owner || user, ownerId, attendees: cleanedAttendees, checkedIn: cleanedCheckedIn };
      
      if (isFirebaseConfigured) {
        const resInfo = resources.find(r => r.id === (finalForm.resourceId || 'meeting-room'));
        const policy = resInfo?.policy || { slotMinutes: 30, allowOverlap: false, capacity: 1 };
        
        const startM = toMin(finalForm.start);
        const endM = toMin(finalForm.end);
        const slotsCount = Math.ceil((endM - startM) / policy.slotMinutes);
        
        const originalRes = isEdit ? reservations.find(r => r.id === f.id) : null;
        
        let success = false;
        let attempt = 0;
        const maxAttempts = policy.allowOverlap ? policy.capacity : 1;
        
        while (!success && attempt < maxAttempts) {
          attempt++;
          const batch = writeBatch(db);
          
          if (isEdit) {
            if (originalRes && originalRes._slots) {
              originalRes._slots.forEach(slotId => {
                batch.delete(doc(db, "reservations", slotId));
              });
            } else if (originalRes && !originalRes._slots) {
              batch.delete(doc(db, "reservations", originalRes.id));
            }
          }
          
          const seatNum = policy.allowOverlap ? attempt : null;
          const dateStr = finalForm.date.replace(/-/g, '');
          
          for (let i = 0; i < slotsCount; i++) {
            const currentSlotStartMin = startM + (i * policy.slotMinutes);
            const currentSlotEndMin = Math.min(currentSlotStartMin + policy.slotMinutes, endM);
            const slotIndex = Math.floor(currentSlotStartMin / policy.slotMinutes);
            
            let slotId = \`\${finalForm.resourceId || 'meeting-room'}_\${dateStr}_\${slotIndex}\`;
            if (seatNum) {
              slotId += \`_\${seatNum}\`;
            }
            
            const slotData = {
              ...finalForm,
              id: slotId,
              start: toHHMM(currentSlotStartMin),
              end: toHHMM(currentSlotEndMin),
              status: 'booked'
            };
            
            batch.set(doc(db, "reservations", slotId), slotData);
          }
          
          for (const pushed of pushedReservations) {
            batch.update(doc(db, "reservations", pushed.id), { start: pushed.start, end: pushed.end });
          }
          
          try {
            await batch.commit();
            success = true;
          } catch (error) {
            console.error("Batch commit failed:", error);
            if (!policy.allowOverlap || attempt >= maxAttempts) {
              setIsSubmitting(false);
              alert("방금 다른 분이 먼저 예약했어요. 다른 시간을 골라주세요.");
              return;
            }
          }
        }
      }`;

code = code.replace(submitResOriginal, submitResModified);

// 3. cancelRes 로직 변경
const cancelResOriginal = `if (isFirebaseConfigured) {
          await deleteDoc(doc(db, "reservations", id));
        }`;
const cancelResModified = `if (isFirebaseConfigured) {
          if (target._slots) {
            const batch = writeBatch(db);
            target._slots.forEach(slotId => {
              batch.update(doc(db, "reservations", slotId), { status: 'cancelled' });
            });
            await batch.commit();
          } else {
            await updateDoc(doc(db, "reservations", id), { status: 'cancelled' });
          }
        }`;
code = code.replace(cancelResOriginal, cancelResModified);

// 4. completeRes 로직 변경 (조기 종료 시 끝 시간 변경)
const completeResRegex = /updateDoc\(doc\(db, "reservations", r.id\), \{ end: toHHMM\(newEndM\) \}\)\.then/g;
const completeResModified = `(async () => {
          if (r._slots) {
            const batch = writeBatch(db);
            r._slots.forEach(slotId => {
              batch.update(doc(db, "reservations", slotId), { end: toHHMM(newEndM) });
            });
            await batch.commit();
          } else {
            await updateDoc(doc(db, "reservations", r.id), { end: toHHMM(newEndM) });
          }
        })().then`;
code = code.replace(completeResRegex, completeResModified);

// 5. extendRes 로직 변경 (연장)
const extendResRegex = /updateDoc\(doc\(db, "reservations", r.id\), \{ end: toHHMM\(newEnd\) \}\)\.then/g;
const extendResModified = `(async () => {
          if (r._slots) {
            // 연장은 복잡하므로 기존 슬롯들을 모두 삭제하고 새로운 슬롯들로 다시 생성합니다
            const resInfo = resources.find(res => res.id === (r.resourceId || 'meeting-room'));
            const policy = resInfo?.policy || { slotMinutes: 30, allowOverlap: false, capacity: 1 };
            const startM = toMin(r.start);
            const slotsCount = Math.ceil((newEnd - startM) / policy.slotMinutes);
            const dateStr = r.date.replace(/-/g, '');
            
            let seatNum = null;
            if (policy.allowOverlap && r._slots.length > 0) {
              const parts = r._slots[0].split('_');
              seatNum = parts[parts.length - 1]; // 마지막이 seatNum
            }
            
            const batch = writeBatch(db);
            r._slots.forEach(slotId => {
              batch.delete(doc(db, "reservations", slotId));
            });
            
            for (let i = 0; i < slotsCount; i++) {
              const currentSlotStartMin = startM + (i * policy.slotMinutes);
              const currentSlotEndMin = Math.min(currentSlotStartMin + policy.slotMinutes, newEnd);
              const slotIndex = Math.floor(currentSlotStartMin / policy.slotMinutes);
              
              let slotId = \`\${r.resourceId || 'meeting-room'}_\${dateStr}_\${slotIndex}\`;
              if (seatNum) {
                slotId += \`_\${seatNum}\`;
              }
              
              const slotData = {
                ...r,
                id: slotId,
                start: toHHMM(currentSlotStartMin),
                end: toHHMM(currentSlotEndMin)
              };
              delete slotData._slots;
              
              batch.set(doc(db, "reservations", slotId), slotData);
            }
            await batch.commit();
          } else {
            await updateDoc(doc(db, "reservations", r.id), { end: toHHMM(newEnd) });
          }
        })().then`;
code = code.replace(extendResRegex, extendResModified);

// 6. fix _slots being written to firestore in checkIn logic (optional, but let's make sure _slots is not written)
const checkInOriginal = `await updateDoc(doc(db, "reservations", r.id), { checkedIn: newCheckedIn });`;
const checkInModified = `if (r._slots) {
            const batch = writeBatch(db);
            r._slots.forEach(slotId => batch.update(doc(db, "reservations", slotId), { checkedIn: newCheckedIn }));
            await batch.commit();
          } else {
            await updateDoc(doc(db, "reservations", r.id), { checkedIn: newCheckedIn });
          }`;
code = code.replace(checkInOriginal, checkInModified);

fs.writeFileSync(appPath, code, 'utf8');
console.log('App.jsx patched successfully for Step 4.');
