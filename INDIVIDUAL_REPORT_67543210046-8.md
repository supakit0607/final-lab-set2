# INDIVIDUAL_REPORT_675432100377.md
## Final Lab Sec2 Set 2

## 1. ข้อมูลผู้จัดทำ

| | |
|---|---|
| **ชื่อ-นามสกุล** | นายปวริศ คูณศรี |
| **รหัสนักศึกษา** | 67543210037-7 |
| **วิชา** | ENGSE207 Software Architecture |
| **งาน** | Final Lab Sec2 Set 2 — Microservices + Activity Tracking + Cloud (Railway) |

---

## 2. ส่วนที่รับผิดชอบ

- Auth Service (`auth-service/`) ทั้งหมด — เพิ่ม Register API และ logActivity()
- Frontend config (`frontend/config.js`) — Railway Service URLs
- Docker Compose (`docker-compose.yml`, `.env.example`)
- Deploy ทุก Service บน Railway (Auth, Task, Activity) รวมถึง Database ทั้ง 3 ตัว
- ตั้งค่า Environment Variables บน Railway ทุกตัว
- Screenshot และทดสอบ Test Cases ทุกข้อ

---

## 3. สิ่งที่ลงมือทำจริง

### เพิ่ม Register API
เขียน `POST /api/auth/register` ใหม่ทั้งหมด ตรวจสอบว่า email หรือ username ซ้ำก่อน ถ้าซ้ำ return 409 Conflict ถ้าผ่านจึง hash password ด้วย bcrypt แล้ว insert ลง DB และส่ง `USER_REGISTERED` event ไปที่ Activity Service แบบ fire-and-forget

### เพิ่ม logActivity() ใน Auth Service
เขียน helper function `logActivity()` ส่ง HTTP POST ไปที่ `ACTIVITY_SERVICE_URL` โดยไม่มี `await` และมี `.catch(() => {})` ทำให้ถ้า Activity Service ล่มก็ไม่กระทบ Auth Service เพิ่มการเรียก logActivity ใน 2 จุดคือหลัง register สำเร็จ และหลัง login สำเร็จ

### config.js
ตั้งค่า Railway URLs ของทั้ง 3 services ให้ frontend เรียกถูกต้อง

### Deploy บน Railway
รับผิดชอบ deploy ทุก service โดยเริ่มจาก Activity Service ก่อน เพราะ Auth และ Task Service ต้องรู้ URL ของ Activity ก่อน จากนั้น deploy Auth Service และ Task Service ตามลำดับ แล้วกลับมาอัปเดต `ACTIVITY_SERVICE_URL` ให้ถูกต้อง

---

## 4. ปัญหาที่พบและวิธีแก้ (อย่างน้อย 2 ปัญหา)

**ปัญหา 1: Frontend เรียก API ไม่ได้ — "Fetch API cannot load file:///..."**

ลืมใส่ `https://` ใน `config.js` ทำให้ browser ตีความ URL เป็น path ใน local filesystem แทน URL จริง เช่น `auth-service-production-fd5b.up.railway.app/api/auth/login` กลายเป็น `file:///Users/.../auth-service-production-fd5b.up.railway.app/api/auth/login` แก้โดยเพิ่ม `https://` นำหน้า Railway URL ทุกตัวใน config.js

**ปัญหา 2: เรียก /me แล้วได้ 500 — token เก่าจาก local**

หลัง deploy บน Railway DB ว่างเปล่า แต่ browser ยังมี JWT เก่าจาก local อยู่ใน localStorage เมื่อโหลดหน้า frontend จะ auto-login ด้วย token นั้น auth-service verify token ผ่านแต่ query user ใน DB ไม่เจอ จึงได้ 500 แก้โดยรัน `localStorage.clear()` ใน browser console แล้ว refresh หน้าใหม่

**ปัญหา 3: Activity ไม่ขึ้นเลยแม้จะ login และสร้าง task ไปแล้ว**

`ACTIVITY_SERVICE_URL` ที่ตั้งไว้บน Railway ขาด `https://` นำหน้า ทำให้ fetch ใน logActivity() ส่ง request ไปไม่ถึง activity-service และล้มเหลวเงียบๆ เพราะเป็น fire-and-forget (มี .catch) ตรวจพบโดยดู Railway Logs แล้วพบว่าไม่มี log เข้ามาที่ activity-service เลย แก้โดยเพิ่ม `https://` แล้ว Redeploy auth-service และ task-service

**ปัญหา 4: Activity Service ต่อ DB ไม่ได้ — password authentication failed**

ตั้งค่า `DATABASE_URL` บน Railway ของ activity-service ผิด พิมพ์ค่าเองแทนที่จะใช้ reference จาก PostgreSQL Plugin ทำให้ใช้ user "admin" และ password "secret123" จาก local แทน credential จริงของ Railway แก้โดยเปลี่ยน `DATABASE_URL` เป็น `${{activity-db.DATABASE_URL}}` แล้ว Redeploy

---

## 5. อธิบาย: Denormalization ใน activities table คืออะไร และทำไมต้องทำ

ใน Database-per-Service pattern แต่ละ service มี DB แยกกันโดยสิ้นเชิง `activity-db` ไม่มี `users` table เพราะ users อยู่ใน `auth-db` ถ้าต้องการแสดง username ใน activity timeline จะต้อง JOIN ข้าม database ซึ่งทำไม่ได้

วิธีแก้คือ denormalize โดยเก็บ `username` ไว้ใน `activities` table เลย ณ เวลาที่ event เกิดขึ้น โดยดึงมาจาก JWT payload ที่มี `username` อยู่แล้ว

ข้อแลกเปลี่ยนคือถ้า user เปลี่ยน username ในอนาคต ข้อมูลเก่าใน activities จะยังเป็นชื่อเดิม แต่ยอมรับได้เพราะ activity log ควรบันทึกสิ่งที่เกิดขึ้น ณ เวลานั้นจริงๆ

---

## 6. อธิบาย: ทำไม logActivity() ต้องเป็น fire-and-forget

```javascript
function logActivity({ ... }) {
  fetch(`${ACTIVITY_URL}/api/activity/internal`, { ... })
    .catch(() => {
      console.warn('activity-service unreachable — skipping');
    });
  // ไม่มี await → return ทันที ไม่รอผล
}
```

เหตุผลที่ไม่ใช้ `await`:

1. **Activity Service เป็น non-critical feature** — ถ้าล่มไม่ควรทำให้ login หรือ register ล้มเหลวตาม เพราะคนละ concern กัน
2. **ลด response time** — ถ้าใช้ `await` auth-service ต้องรอ network round-trip ไปหา activity-service ก่อนถึงจะ return ผลให้ user ได้ ทำให้ช้าโดยไม่จำเป็น
3. **Loose coupling** — Microservices ควรเป็นอิสระจากกัน ถ้า service หนึ่งล้มไม่ควรลาก service อื่นล้มด้วย

เราเห็นผลจริงระหว่างทำงาน ตอนที่ activity-service ต่อ DB ไม่ได้ auth-service และ task-service ยังทำงานได้ปกติ เพราะ fire-and-forget ทำให้ error ถูกกลืนไปเงียบๆ

---

## 7. ส่วนที่ยังไม่สมบูรณ์หรืออยากปรับปรุง

- `config.js` ต้องแก้ URL มือทุกครั้ง ควรทำให้ frontend build จาก environment variable แทน
- logActivity() ไม่มี retry mechanism ถ้า activity-service ล่มชั่วคราว event จะหายไปถาวร ควรเพิ่ม message queue เช่น Redis ในอนาคต
- ควรเพิ่ม Register form validation ฝั่ง frontend ให้ละเอียดกว่านี้ เช่น ตรวจ email format และความยาว username
