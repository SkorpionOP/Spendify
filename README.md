<div align="center">

# 💸 Spendify (Alpha)

**Your Personal Financial Command Center**

[![React](https://img.shields.io/badge/React-18.x-blue?style=for-the-badge&logo=react)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.x-purple?style=for-the-badge&logo=vite)](https://vitejs.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-336791?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Auth-FFCA28?style=for-the-badge&logo=firebase)](https://firebase.google.com/)

*Spendify is a robust, full-stack personal expense tracker built to help you manage, analyze, and optimize your financial life with zero friction.*

---

</div>

## 🚧 Alpha Release
> **Note:** Spendify is currently in **v0.1.0-alpha**. The core engine is fully functional, but we are actively building out the UI/UX, adding new analytics dashboards, and squashing bugs. Contributions, feature requests, and issue reports are highly encouraged!

## ✨ Features
- **Seamless Authentication**: Secure login flow powered by Firebase Auth (Google OAuth & Email/Password).
- **Expense Tracking**: Log expenses instantly with categorization and dynamic metadata.
- **Budgeting Engine**: Set up automated monthly budgets and track your "Needs vs Savings" rules.
- **Lightning Fast API**: Built on FastAPI for high-performance, asynchronous REST endpoints.
- **Relational Integrity**: Powered by a robust PostgreSQL database hosted on Supabase.

---

## 🏗️ Architecture & Tech Stack

| Component | Technology | Description |
|---|---|---|
| **Frontend** | React + Vite | Blazing fast client rendered with vanilla CSS and modern React hooks. |
| **Backend** | FastAPI (Python) | High-concurrency Python API handling authentication states and DB execution. |
| **Database** | PostgreSQL (Supabase) | Highly scalable relational database. |
| **Auth** | Firebase | Serverless, zero-maintenance identity management. |

---

## 📂 Project Structure

```text
spendify/
├── frontend/                 # React SPA
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Application views (Dashboard, Login, etc)
│   │   ├── services/         # Firebase config & Axios API instances
│   │   └── App.jsx           # Main React Router configuration
├── backend/                  # FastAPI Application
│   ├── database/             # PostgreSQL connection pooling & schema init
│   ├── models/               # DB execution wrappers
│   ├── routers/              # API Endpoints (Auth, Dashboard, Budget)
│   ├── schemas/              # Pydantic models for request validation
│   └── main.py               # Application entrypoint
└── vercel.json               # Serverless deployment configuration
```

---

## 🚀 Local Development Setup

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/spendify.git
cd spendify
```

### 2. Backend Environment
Navigate to the backend directory, create a virtual environment, and install the dependencies:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in the root/backend directory:
```env
DATABASE_URL=postgres://[user]:[password]@[host]:[port]/[db]
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_auth_domain
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_storage_bucket
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
FIREBASE_MEASUREMENT_ID=your_measurement_id
```

Run the backend server:
```bash
uvicorn main:app --reload
```

### 3. Frontend Environment
Open a new terminal, navigate to the frontend directory, and start Vite:
```bash
cd frontend
npm install
npm run dev
```

---

## ☁️ Deployment Gotchas (Vercel & Supabase)

If you are forking and deploying this to Vercel, pay attention to these architectural constraints:

1. **IPv6 Blockades**: Supabase now uses IPv6 for direct connections. Since Vercel's AWS Lambda environments do not natively support outbound IPv6, you **must** use the Supabase **IPv4 Connection Pooler** URL (ending in `.pooler.supabase.com:6543`) for your `DATABASE_URL`.
2. **Pydantic Validation**: The backend uses Pydantic's `EmailStr`. This requires the `email-validator` C-extension. We explicitly included it in `backend/requirements.txt` to ensure Vercel installs it during the build step.
3. **Vercel Folder Flattening**: Vercel extracts the backend folder structure during deployment. To support absolute imports (e.g., `from backend.database...`), we implemented a dynamic module aliasing script inside `backend/main.py`.

---

## 🗺️ Roadmap
- [x] Secure Firebase Authentication pipeline
- [x] Core Postgres schema and connection pooling
- [x] Basic Expense CRUD operations
- [ ] Advanced graphical analytics dashboard
- [ ] Plaid API integration for automated bank sync
- [ ] Dark Mode Support
- [ ] Progressive Web App (PWA) configuration

---

## 🤝 Contributing
Found a bug or want to build a new feature? 
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<div align="center">
  <p>Built with ❤️ for better personal finance.</p>
</div>
