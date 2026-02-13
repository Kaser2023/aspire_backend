# Academy ASP Backend API

Backend API for the Sports Academy Management System built with Node.js, Express, and MySQL.

## Features

- 🔐 Multi-role authentication (Parent, Coach, Branch Admin, Accountant, Super Admin, Owner)
- 📲 OTP-based phone authentication for parents
- 👥 User management with role-based access control
- 🏃 Player registration and management
- 🏢 Branch management (4 branches: Riyadh, Jeddah, Dammam, Mecca)
- 📚 Program management
- 💳 Payment processing
- 📊 Attendance tracking
- 📱 SMS messaging
- 📢 Announcements

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MySQL
- **ORM:** Sequelize
- **Authentication:** JWT (JSON Web Tokens)
- **Validation:** express-validator
- **Security:** Helmet, CORS, bcryptjs

## Project Structure

```
backend/
├── migrations/         # Database migrations
├── seeders/           # Database seeders
├── src/
│   ├── config/        # Configuration files
│   │   ├── constants.js
│   │   └── database.js
│   ├── controllers/   # Route controllers
│   │   ├── auth.controller.js
│   │   ├── user.controller.js
│   │   ├── player.controller.js
│   │   ├── branch.controller.js
│   │   ├── program.controller.js
│   │   ├── payment.controller.js
│   │   ├── attendance.controller.js
│   │   ├── sms.controller.js
│   │   └── announcement.controller.js
│   ├── middleware/    # Express middleware
│   │   ├── auth.js
│   │   ├── errorHandler.js
│   │   ├── notFound.js
│   │   ├── upload.js
│   │   └── validate.js
│   ├── models/        # Sequelize models
│   │   ├── index.js
│   │   ├── User.js
│   │   ├── Branch.js
│   │   ├── Program.js
│   │   ├── Player.js
│   │   ├── Subscription.js
│   │   ├── Payment.js
│   │   ├── Attendance.js
│   │   ├── SMS.js
│   │   ├── Announcement.js
│   │   └── Session.js
│   ├── routes/        # API routes
│   │   ├── auth.routes.js
│   │   ├── user.routes.js
│   │   ├── player.routes.js
│   │   ├── branch.routes.js
│   │   ├── program.routes.js
│   │   ├── payment.routes.js
│   │   ├── attendance.routes.js
│   │   ├── sms.routes.js
│   │   └── announcement.routes.js
│   ├── services/      # Business logic services
│   │   └── sms.service.js
│   ├── utils/         # Utility functions
│   │   ├── helpers.js
│   │   └── validators.js
│   ├── app.js         # Express app configuration
│   └── server.js      # Server entry point
├── uploads/           # File uploads directory
├── .sequelizerc       # Sequelize CLI configuration
├── env.example        # Environment variables example
├── package.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js >= 18.x
- MySQL >= 8.0
- npm or yarn

### Installation

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp env.example .env
   ```

4. Update `.env` with your configuration:
   ```env
   NODE_ENV=development
   PORT=5000
   
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=academy_asp
   DB_USER=root
   DB_PASSWORD=your_password
   
   JWT_SECRET=your_jwt_secret_key
   JWT_EXPIRES_IN=7d
   
   FRONTEND_URL=http://localhost:5173
   ```

5. Create the database:
   ```sql
   CREATE DATABASE academy_asp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

6. Run migrations:
   ```bash
   npm run db:migrate
   ```

7. (Optional) Run seeders:
   ```bash
   npm run db:seed
   ```

8. Start the server:
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## API Endpoints

### Authentication (Email/Password)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login user |
| GET | `/api/auth/me` | Get current user |
| PUT | `/api/auth/me` | Update current user |
| POST | `/api/auth/change-password` | Change password |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password |
| POST | `/api/auth/refresh-token` | Refresh access token |
| POST | `/api/auth/logout` | Logout user |
| POST | `/api/auth/logout-all` | Logout from all devices |

### OTP Authentication (Phone - for Parents)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/send-otp` | Send 6-digit OTP to phone |
| POST | `/api/auth/verify-otp` | Verify OTP and create session |
| POST | `/api/auth/resend-otp` | Resend OTP |
| POST | `/api/auth/complete-registration` | Complete registration after OTP verification |

#### OTP Flow Example:
```javascript
// Step 1: Send OTP
POST /api/auth/send-otp
{ "phone": "+966501234567" }
// Response: { success: true, expires_in: 300 }

// Step 2: Verify OTP (existing user)
POST /api/auth/verify-otp
{ "phone": "+966501234567", "code": "123456" }
// Response: { success: true, data: { user, accessToken, refreshToken } }

// Step 2: Verify OTP (new user)
POST /api/auth/verify-otp
{ "phone": "+966501234567", "code": "123456", "first_name": "Ahmad", "last_name": "Ali" }
// Response: { success: true, data: { user, accessToken, refreshToken, is_new_user: true } }
```

**OTP Features:**
- 6-digit numeric code
- 5-minute expiration
- Max 3 verification attempts per OTP
- Rate limiting: 1 OTP per minute, 10 per day

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | Get all users |
| GET | `/api/users/:id` | Get user by ID |
| POST | `/api/users` | Create user |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Delete user |
| PATCH | `/api/users/:id/status` | Toggle user status |

### Players
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/players` | Get all players |
| GET | `/api/players/:id` | Get player by ID |
| POST | `/api/players` | Create player |
| PUT | `/api/players/:id` | Update player |
| DELETE | `/api/players/:id` | Delete player |
| GET | `/api/players/stats` | Get player statistics |

### Branches
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/branches/public` | Get public branches |
| GET | `/api/branches` | Get all branches |
| GET | `/api/branches/:id` | Get branch by ID |
| POST | `/api/branches` | Create branch |
| PUT | `/api/branches/:id` | Update branch |
| DELETE | `/api/branches/:id` | Delete branch |

### Programs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/programs/public` | Get public programs |
| GET | `/api/programs` | Get all programs |
| GET | `/api/programs/:id` | Get program by ID |
| POST | `/api/programs` | Create program |
| PUT | `/api/programs/:id` | Update program |
| DELETE | `/api/programs/:id` | Delete program |

### Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/payments` | Get all payments |
| GET | `/api/payments/:id` | Get payment by ID |
| POST | `/api/payments` | Create payment |
| PATCH | `/api/payments/:id/complete` | Mark as completed |
| POST | `/api/payments/:id/refund` | Process refund |
| GET | `/api/payments/stats` | Get payment statistics |

### Attendance
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/attendance` | Get all attendance |
| POST | `/api/attendance` | Record attendance |
| POST | `/api/attendance/bulk` | Bulk record attendance |
| GET | `/api/attendance/stats` | Get attendance statistics |

### SMS
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sms` | Get all SMS messages |
| POST | `/api/sms/send` | Send SMS |
| POST | `/api/sms/send-branch` | Send to branch |
| POST | `/api/sms/send-program` | Send to program |
| GET | `/api/sms/auto-settings` | Get auto SMS settings |
| POST | `/api/sms/auto-settings` | Create auto SMS setting |
| PUT | `/api/sms/auto-settings/:id` | Update auto SMS setting |
| DELETE | `/api/sms/auto-settings/:id` | Delete auto SMS setting |
| POST | `/api/sms/trigger-auto` | Manually trigger auto SMS |
| GET | `/api/sms/scheduler-status` | Get scheduler status |

### Announcements
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/announcements` | Get all announcements |
| GET | `/api/announcements/feed` | Get announcements feed |
| POST | `/api/announcements` | Create announcement |
| PATCH | `/api/announcements/:id/publish` | Publish announcement |

### Dashboard Statistics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stats/super-admin` | Super admin dashboard stats |
| GET | `/api/stats/branch/:branchId` | Branch dashboard stats |
| GET | `/api/stats/coach/:coachId` | Coach dashboard stats |
| GET | `/api/stats/parent/:parentId` | Parent dashboard stats |
| GET | `/api/stats/financial` | Financial statistics |
| GET | `/api/stats/accountant` | Accountant dashboard stats |

#### Statistics Endpoints Details:

**Super Admin Stats** returns:
- total_players, total_coaches, total_branches, total_programs
- revenue_this_month, pending_payments, overdue_subscriptions
- new_registrations_this_week, revenue_by_branch

**Branch Stats** returns:
- player_count, coach_count, program_count
- revenue_this_month, pending_registrations, today_attendance_rate

**Coach Stats** returns:
- assigned_players_count, programs_count, today_sessions
- weekly_attendance_rate, upcoming_sessions

**Parent Stats** returns:
- children_count, active_subscriptions, pending_payments
- upcoming_sessions, attendance_summary

**Financial Stats** (with query params `branch_id`, `from_date`, `to_date`) returns:
- total_income, total_refunds, net_revenue
- revenue_by_branch, revenue_by_program, payment_methods_breakdown

## User Roles

| Role | Description |
|------|-------------|
| `parent` | Parent/Guardian of players |
| `coach` | Coach/Trainer |
| `branch_admin` | Branch manager/admin |
| `accountant` | Financial staff |
| `super_admin` | System administrator |
| `owner` | Academy owner (highest privilege) |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | development |
| `PORT` | Server port | 5000 |
| `DB_HOST` | Database host | localhost |
| `DB_PORT` | Database port | 3306 |
| `DB_NAME` | Database name | academy_asp |
| `DB_USER` | Database user | root |
| `DB_PASSWORD` | Database password | - |
| `JWT_SECRET` | JWT signing secret | - |
| `JWT_EXPIRES_IN` | JWT expiration | 7d |
| `FRONTEND_URL` | Frontend URL for CORS | http://localhost:5173 |
| `ENABLE_SMS_SCHEDULER` | Enable auto SMS cron jobs | true |

## Scripts

```bash
npm start          # Start production server
npm run dev        # Start development server with nodemon
npm run db:migrate # Run database migrations
npm run db:seed    # Run database seeders
npm run db:reset   # Reset database (undo all, migrate, seed)
```

## Default Seed Data

After running `npm run db:seed`, the following accounts are created:

### All Users Login (Phone + Password)

| Role | Phone | Password |
|------|-------|----------|
| Owner | +966500000001 | Password123! |
| Super Admin | +966500000002 | Password123! |
| Accountant | +966500000003 | Password123! |
| Branch Admin (Riyadh) | +966500000010 | Password123! |
| Branch Admin (Jeddah) | +966500000011 | Password123! |
| Coach (Riyadh) | +966500000020 | Password123! |
| Parent 1 | +966500000030 | Password123! |
| Parent 2 | +966500000031 | Password123! |

**Note:** OTP is used only during registration for phone verification. After registration, all users login with Phone + Password.

**Seed Data Includes:**
- 4 Branches (Riyadh, Jeddah, Dammam, Mecca)
- 4 Programs (Juniors, Youth, Summer Camp, Private Sessions)
- 8 Coaches (2 per branch for main branches)
- 4 Parents with children
- 5 Players with active subscriptions
- Sample payments and announcements
- 3 Auto SMS settings (subscription expiring, payment overdue, session reminder)

## Auto SMS Scheduler

The backend includes an automatic SMS scheduler powered by `node-cron` that sends reminders automatically.

### Cron Job Schedule

| Job | Schedule | Description |
|-----|----------|-------------|
| All Auto SMS | Daily at 9:00 AM (Asia/Riyadh) | Runs all enabled auto SMS jobs |

### Default Auto SMS Rules

| Type | Timing | Description |
|------|--------|-------------|
| Subscription Expiring | 7 days before | Reminds parents about expiring subscriptions |
| Payment Overdue | 3 days after | Notifies parents about overdue payments |
| Session Reminder | 1 day before | Reminds parents about tomorrow's training |

### Configuration

Set `ENABLE_SMS_SCHEDULER=false` in `.env` to disable the scheduler.

### Manual Trigger

For testing, super admins can manually trigger auto SMS:
```bash
POST /api/sms/trigger-auto
Authorization: Bearer <token>
```

### Managing Auto SMS Settings

```javascript
// Get all settings
GET /api/sms/auto-settings

// Update a setting
PUT /api/sms/auto-settings/:id
{
  "enabled": true,
  "days_before": 5,
  "message": "Updated message with {parent_name} placeholders"
}
```

### Message Placeholders

| Placeholder | Description |
|-------------|-------------|
| `{parent_name}` | Parent's full name |
| `{children}` | List of children names |
| `{days}` | Days before/after |
| `{end_date}` | Subscription end date |
| `{total_due}` | Total amount due |
| `{sessions}` | Session details |
| `{date}` | Session date |

## License

ISC

