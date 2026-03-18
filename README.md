# ENGSE207 Software Architecture
# Final Lab Sec2 Set 2 — Microservices + Activity Tracking + Cloud (Railway)

**รายวิชา:** ENGSE207 Software Architecture  
**มหาวิทยาลัย:** มหาวิทยาลัยเทคโนโลยีราชมงคลล้านนา

---

## สมาชิกในกลุ่ม

| รหัสนักศึกษา | ชื่อ-นามสกุล |
|---|---|
| 67543210046-8 | นายศุภกิจ รักบุตร |


## Railway URLs (Cloud)

| Service | URL |
|---|---|
| Auth Service | `https://your-auth-service.up.railway.app` |
| Task Service | `https://your-task-service.up.railway.app` |
| Activity Service | `https://your-activity-service.up.railway.app` |

> ⚠️ อัปเดต URL จริงหลัง deploy เสร็จ

---

## 1. ภาพรวมและสิ่งที่เพิ่มจาก Set 1

| Set 1 | Set 2 |
|---|---|
| 4 services: auth, task, log, frontend | 3 services บน Cloud: auth, task, activity |
| Shared PostgreSQL (1 DB) | Database-per-Service (3 DB แยก) |
| Log Service แยก | แต่ละ service log ลง DB ตัวเอง + ส่ง event ไป Activity Service |
| ไม่มี Register | มี Register API ใน Auth Service |
| Local-only (HTTPS + Nginx) | Deploy บน Railway (HTTPS อัตโนมัติ) |

---

## 2. Architecture Diagram

### Local (Docker Compose)

```
Browser / Postman
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│   Docker Compose (Local Test)                                │
│                                                              │
│  Auth Svc :3001   Task Svc :3002   Activity Svc :3003        │
│      │                 │                   ▲                 │
│      └─────────────────┴── POST /internal ─┘                 │
│      │                 │                   │                 │
│      ▼                 ▼                   ▼                 │
│  auth-db           task-db           activity-db             │
│  (users, logs)     (tasks, logs)     (activities)            │
└──────────────────────────────────────────────────────────────┘
```

### Cloud (Railway)

```
Browser / Postman
        │ HTTPS (Railway จัดการให้อัตโนมัติ)
        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Railway Project                          │
│  Auth Service          Task Service       Activity Service  │
│  https://auth-xxx…     https://task-xxx…  https://act-xxx…  │
│       │                      │                    ▲         │
│       └──────────────────────┴─ POST /internal ───┘         │
│       ▼                      ▼                    ▼         │
│   auth-db [PG]          task-db [PG]       activity-db [PG] │
│                                                             │
│   Frontend เรียกแต่ละ service โดยตรงผ่าน config.js            │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Denormalization ใน activities table

`activities` table เก็บ `username` ไว้แม้จะรู้ `user_id` อยู่แล้ว เพราะ:

- `activity-db` ไม่มี `users` table — ข้อมูล username อยู่ใน `auth-db`
- ใน Database-per-Service pattern ไม่สามารถ JOIN ข้าม database ได้
- จึงต้อง **denormalize** โดยเก็บ `username` ณ เวลาที่ event เกิดขึ้น (ดึงจาก JWT payload)

ข้อแลกเปลี่ยน: ถ้า user เปลี่ยน username ในอนาคต ข้อมูลเก่าใน activities จะไม่อัปเดตตาม แต่ยอมรับได้เพราะ activity log ควรบันทึกสิ่งที่เกิดขึ้น ณ เวลานั้น

---

## 4. Fire-and-Forget Pattern

```javascript
function logActivity({ userId, username, eventType, ... }) {
  const ACTIVITY_URL = process.env.ACTIVITY_SERVICE_URL;
  fetch(`${ACTIVITY_URL}/api/activity/internal`, {
    method: 'POST', ...
  }).catch(() => {
    console.warn('activity-service unreachable — skipping');
    // ไม่ throw error → service หลักทำงานต่อได้
  });
  // ไม่มี await → ไม่รอผล
}
```

**ทำไมต้องใช้ pattern นี้:**
- Activity Service เป็น non-critical feature — ถ้าล่มไม่ควรทำให้ login หรือ create task ล้มเหลว
- การใช้ `await` จะทำให้ response time ของ Auth/Task Service ช้าขึ้นโดยไม่จำเป็น
- Microservices ควร loosely coupled — แต่ละ service ล้มเหลวได้โดยไม่กระทบอีก service

---

## 5. Gateway Strategy

เลือก **Option A**: Frontend เรียก URL ของแต่ละ service โดยตรงผ่าน `config.js`

```javascript
window.APP_CONFIG = {
  AUTH_URL:     'https://your-auth.up.railway.app',
  TASK_URL:     'https://your-task.up.railway.app',
  ACTIVITY_URL: 'https://your-activity.up.railway.app'
};
```

เหตุผล: ง่ายที่สุดสำหรับ scope ของงานนี้ ไม่ต้อง deploy Nginx เพิ่ม Railway จัดการ HTTPS ให้อัตโนมัติ

---

## 6. วิธีรัน Local

```bash
# 1. สร้าง .env
cp .env.example .env

# 2. แก้ config.js ให้ใช้ localhost
# เปลี่ยน APP_CONFIG ใน frontend/config.js เป็น:
# AUTH_URL: 'http://localhost:3001'
# TASK_URL: 'http://localhost:3002'
# ACTIVITY_URL: 'http://localhost:3003'

# 3. รัน
docker compose up --build

# 4. ทดสอบ
curl http://localhost:3001/api/auth/health
curl http://localhost:3002/api/tasks/health
curl http://localhost:3003/api/activity/health
```

---

## 7. Environment Variables

| Variable | Service | Description |
|---|---|---|
| `DATABASE_URL` | ทุก service | PostgreSQL connection string (Railway ใส่ให้อัตโนมัติ) |
| `JWT_SECRET` | ทุก service | ต้องเหมือนกัน ทุก service |
| `JWT_EXPIRES` | auth-service | อายุ token (เช่น `1h`) |
| `ACTIVITY_SERVICE_URL` | auth, task | URL ของ Activity Service |
| `PORT` | ทุก service | port ที่ service ฟัง |
| `NODE_ENV` | ทุก service | `development` หรือ `production` |

---

## 8. Activity Events

| event_type | ส่งมาจาก | เกิดขึ้นเมื่อ |
|---|---|---|
| `USER_REGISTERED` | auth-service | POST /register สำเร็จ |
| `USER_LOGIN` | auth-service | POST /login สำเร็จ |
| `TASK_CREATED` | task-service | POST /tasks สำเร็จ |
| `TASK_STATUS_CHANGED` | task-service | PUT /tasks/:id เปลี่ยน status |
| `TASK_DELETED` | task-service | DELETE /tasks/:id |

---

## 9. วิธีทดสอบบน Cloud

```bash
AUTH_URL="https://your-auth-xxx.up.railway.app"
TASK_URL="https://your-task-xxx.up.railway.app"
ACTIVITY_URL="https://your-activity-xxx.up.railway.app"

# Register
curl -X POST $AUTH_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@sec2.local","password":"123456"}'

# Login
TOKEN=$(curl -s -X POST $AUTH_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@sec2.local","password":"123456"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# ตรวจ activity/me
curl $ACTIVITY_URL/api/activity/me -H "Authorization: Bearer $TOKEN"

# Create Task
curl -X POST $TASK_URL/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Cloud test","priority":"high"}'

# ตรวจ TASK_CREATED
curl $ACTIVITY_URL/api/activity/me -H "Authorization: Bearer $TOKEN"

# No JWT → 401
curl $TASK_URL/api/tasks

# member → 403 on /all
curl $ACTIVITY_URL/api/activity/all -H "Authorization: Bearer $TOKEN"
```

---

## 10. Known Limitations

- Frontend เป็น static HTML ต้องแก้ `config.js` มือหลังได้ Railway URL จริง
- ไม่มี Nginx gateway — frontend เรียก services โดยตรง (CORS ต้องเปิดไว้)
- Activity log เป็น append-only ไม่มี delete หรือ update
- ถ้า Activity Service ล่ม activities จะหาย (fire-and-forget ไม่มี retry)

---

## 11. การแบ่งงาน

ดูรายละเอียดใน `TEAM_SPLIT.md`
