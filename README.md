# LUMEN

LUMEN یک اپلیکیشن موزیک و فوکوس است: کاربر موسیقی گوش می‌دهد، پلی‌لیست می‌سازد،
جلسه‌های فوکوس (Pomodoro-style) اجرا می‌کند و پیشرفت روزانه/هفتگی/ماهانه‌ی خودش را
در داشبورد و آنالیتیکس می‌بیند. بک‌اند Express + better-sqlite3 است و فرانت‌اند
استاتیک (بدون بیلدر) از همان سرور سرو می‌شود.

## پیش‌نیاز

- Node.js >= 18

## نصب و اجرا

```bash
npm install
npm run seed     # دیتابیس SQLite را می‌سازد و داده‌ی نمونه (از جمله کاربر دمو) را وارد می‌کند
npm start        # سرور را روی http://localhost:3000 بالا می‌آورد
```

برای توسعه با ری‌استارت خودکار:

```bash
npm run dev
```

## کاربر دمو

- ایمیل: `amir@lumen.app`
- رمز عبور: `lumen1234`

## ساختار پوشه‌ها

```
backend/
  config/        # بارگذاری .env و اتصال به دیتابیس (backend/config/databse.js)
  controllers/    # منطق هر route (auth, user, focus, analytics, music, playlist, ai)
  middleware/    # احراز هویت (requireAuth) و مدیریت خطا (asyncHandler/ApiError)
  routes/        # تعریف endpointهای REST، هر فایل برای یک بخش
  services/      # منطق دامنه: auth، آنالیتیکس، کاتالوگ SoundCloud، سرویس هوش مصنوعی، کاربر
  utils/         # ابزارهای کمکی (id، توکن JWT، asyncHandler، ApiError، sanitizeUser)
  server.js      # نقطه‌ی ورود Express؛ روت‌های API را mount می‌کند و frontend/ را serve می‌کند
database/
  schema.sql, users.sql, playlists.sql, favorites.sql, focus_sessions.sql, analytics.sql
  seed.js        # اسکریپت seed (npm run seed)
frontend/
  *.html         # صفحات (login، signup، onboarding، dashboard، music، focus، analytics، ai، profile)
  css/           # استایل هر صفحه به‌صورت جدا
  js/            # منطق هر صفحه به سبک IIFE زیر namespace سراسری LUMEN، بدون bundler
  assets/        # آیکون‌ها، تصاویر، فونت‌ها، صداها
```

## فهرست endpointها

همه‌ی مسیرهای زیر با پیشوند `/api` سرو می‌شوند. جز `POST /api/auth/register` و
`POST /api/auth/login`، بقیه به هدر `Authorization: Bearer <token>` (احراز هویت JWT) نیاز دارند.

### سلامت سرور

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/health` | وضعیت زنده‌بودن سرور و زمان فعلی را برمی‌گرداند |

### Auth — `/api/auth`

| متد | مسیر | توضیح |
|---|---|---|
| POST | `/api/auth/register` | ثبت‌نام کاربر جدید |
| POST | `/api/auth/login` | ورود با ایمیل/رمز عبور و دریافت توکن |
| GET | `/api/auth/me` | اطلاعات کاربر لاگین‌شده |

### Users — `/api/users`

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/users/me` | پروفایل کاربر جاری |
| PATCH | `/api/users/me` | ویرایش پروفایل کاربر جاری (مثلاً هدف روزانه‌ی فوکوس) |

### Focus — `/api/focus`

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/focus/active` | جلسه‌ی فوکوس در حال اجرا/مکث‌شده‌ی کاربر (برای ادامه بعد از reload) |
| GET | `/api/focus/history` | تا ۵۰ جلسه‌ی فوکوس اخیر کاربر |
| POST | `/api/focus` | شروع جلسه‌ی فوکوس جدید با یک preset (و در صورت وجود، ترک انتخابی) |
| POST | `/api/focus/:id/pause` | مکث‌کردن جلسه‌ی در حال اجرا |
| POST | `/api/focus/:id/resume` | ازسرگیری جلسه‌ی مکث‌شده |
| POST | `/api/focus/:id/complete` | پایان‌دادن (کامل‌کردن) جلسه و ثبت آن در آنالیتیکس |

### Analytics — `/api/analytics`

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/analytics/today` | آمار فوکوس امروز |
| GET | `/api/analytics/weekly` | آمار فوکوس ۷ روز اخیر |
| GET | `/api/analytics/monthly` | آمار فوکوس ۳۰ روز اخیر (همان شکل weekly، برای toggle ماهانه) |
| GET | `/api/analytics/heatmap` | ماتریس ۷×۶ (روز هفته × بازه‌ی سه‌ساعته) دقایق فوکوس تکمیل‌شده در ۲۸ روز اخیر |
| GET | `/api/analytics/session-mix` | درصد نوع جلسه‌های فوکوس (Deep work / Sprint / Ambient flow) در ۲۸ روز اخیر |
| GET | `/api/analytics/top-sounds` | صداهای پرتکرار کاربر بر اساس آمار او |

### Music — `/api/music`

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/music` | فهرست ترک‌ها؛ با `?ambient=true` فقط ترک‌های Ambient، با `?q=` جست‌وجو |
| GET | `/api/music/now-playing` | ترک در حال پخش فعلی به همراه وضعیت لایک |
| GET | `/api/music/favorites` | فهرست ترک‌های موردعلاقه‌ی کاربر |
| POST | `/api/music/:trackId/favorite` | لایک/آن‌لایک‌کردن یک ترک (toggle) |

### Playlists — `/api/playlists`

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/playlists` | فهرست پلی‌لیست‌های کاربر به همراه تعداد ترک هرکدام |
| POST | `/api/playlists` | ساخت پلی‌لیست جدید |
| GET | `/api/playlists/:id/tracks` | ترک‌های یک پلی‌لیست به ترتیب |
| POST | `/api/playlists/:id/tracks` | افزودن یک ترک به پلی‌لیست |
| DELETE | `/api/playlists/:id/tracks/:trackId` | حذف یک ترک از پلی‌لیست |
| DELETE | `/api/playlists/:id` | حذف کل پلی‌لیست (پلی‌لیست‌های سیستمی حذف نمی‌شوند) |

### AI — `/api/ai`

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/ai/insight` | بینش/تحلیل تولیدشده درباره‌ی الگوی فوکوس کاربر |

## متغیرهای محیطی (`backend/.env`)

`backend/config/env.js` خودش فایل `.env` را می‌خواند و پارس می‌کند (بدون وابستگی به
پکیج `dotenv` — این پروژه فقط از `better-sqlite3`، `cors` و `express` استفاده می‌کند).

| متغیر | توضیح |
|---|---|
| `PORT` | پورتی که سرور روی آن گوش می‌دهد (پیش‌فرض `3000`) |
| `NODE_ENV` | `development` یا `production` |
| `DB_PATH` | مسیر فایل دیتابیس SQLite (نسبت به `backend/`) |
| `JWT_SECRET` | کلید امضای توکن‌های JWT |
| `JWT_EXPIRES_IN` | مدت اعتبار توکن به ثانیه |
| `CORS_ORIGIN` | origin مجاز برای CORS (پیش‌فرض `*`) |

⚠️ در `NODE_ENV=production` نباید `JWT_SECRET` روی مقدار پیش‌فرض/نمونه (placeholder)
باقی بماند؛ در این حالت `env.js` عمداً با خطا متوقف می‌شود چون هرکسی می‌تواند با آن
مقدار شناخته‌شده توکن جعل کند. یک مقدار طولانی و تصادفی برای `JWT_SECRET` تولید کنید.
