# EditDesk - Client Portal by GT Edits 

A modern, full-stack client portal and creative operations management platform designed for video editing studios, agencies, and freelance creatives. Built with **React 18**, **Vite**, **Express**, **MongoDB**, **Firebase Auth & Realtime Database**, **Brevo Email API**, and powered by **Google Gemini AI**.

---

## Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
  - [Client Portal](#-client-portal)
  - [Admin Dashboard](#-admin-dashboard)
  - [AI Brief Planner & Voice Scoping](#-ai-brief-planner--voice-scoping)
  - [Deliverables & Revisions](#-deliverables--revisions)
  - [Invoicing & Billing Engine](#-invoicing--billing-engine)
  - [High-Deliverability Email Notifications (Brevo)](#-high-deliverability-email-notifications-brevo)
  - [Google Drive Automation](#-google-drive-automation)
- [Tech Stack](#-tech-stack)
- [Project Architecture](#-project-architecture)
- [Directory Structure](#-directory-structure)
- [Prerequisites](#-prerequisites)
- [Getting Started](#-getting-started)
  - [1. Clone Repository](#1-clone-repository)
  - [2. Install Dependencies](#2-install-dependencies)
  - [3. Configure Environment Variables](#3-configure-environment-variables)
  - [4. Run in Development Mode](#4-run-in-development-mode)
- [Environment Variables Reference](#-environment-variables-reference)
  - [Frontend (`.env`)](#frontend-env)
  - [Backend (`server/.env`)](#backend-serverenv)
- [API Routes Summary](#-api-routes-summary)
- [Deployment](#-deployment)
  - [Vercel (Frontend SPA)](#vercel-frontend-spa)
  - [Render (Backend Express Service)](#render-backend-express-service)
- [License](#-license)

---

## Overview

The **EditDesk - Client Portal by GT Edits** bridges the communication and delivery gap between video editors/creative agencies and their clients. It replaces fragmented WhatsApp chats, email threads, and untracked file transfers with a unified, high-performance workspace offering:

- **Real-Time Project Tracking**: Transparent progress, timeline milestones, and delivery statuses.
- **AI-Driven Brief Planner with Voice Input**: Client work request submission with microphone speech-to-text dictation, automated scoping, and rate-chart cost estimations.
- **Deliverable Hub & Revisions**: Video/image streaming, watermark indicators, client download toggles, and itemized revision request workflows.
- **Full Invoicing & Billing Suite**: Interactive invoice generator modal, live invoice preview, auto-numbering (`#001`), line items, tax/discount/advance calculations, persistent bank details, signature uploads, and downloadable PDF invoices.
- **Automated Google Drive Sync**: Instant provisioning of client parent and sub-folders using multiple authentication methods (Service Account JSON string, secret file, or OAuth2).
- **Direct Inbox Email Notifications via Brevo**: Professional transactional emails for deliverable uploads, work request approvals/rejections, and payment reminders with attached PDF invoices—engineered to bypass spam filters.
- **Tabbed Admin Panel & Modernized Mobile UI**: Clean separation of Dashboard, Clients, Projects, Requests, and Invoices with a fluid Dark/Light theme engine.

---

## Key Features

### Client Portal
- **Dashboard Overview**: Immediate visibility into active projects, deliverables awaiting review, approved deliverables, and payment summaries.
- **AI-Assisted Request Submission**: Interactive brief form with integrated **Microphone Voice Dictation** (Web Speech API) and AI scoping powered by Google Gemini.
- **Dedicated Invoices Tab**: Real-time view of all issued invoices, payment status badges (`Pending` vs `Paid`), unpaid invoice counts, live in-app preview, and instant PDF download.
- **Payments & Statements Summary**: Real-time calculation of total billed amount, advance received, and remaining balance due with UPI and bank transfer information.
- **Interactive Deliverable Review**: In-browser video and image preview with playback controls, download permissions toggle, and watermarking status indicators.
- **Timestamped Revision Requests**: Submit targeted revision checklists and notes directly against specific deliverable versions.
- **Calendly Integration**: Embedded one-click meeting scheduling for project syncs.
- **Adaptive Theme Switcher**: Instant switching between Dark and Light themes, complete with mobile compact pill controls.

### Admin Dashboard
- **Organized Tabbed Navigation**:
  - 📊 **Dashboard**: High-level metrics, active project counters, revenue totals, and slide-out **Overdue Tasks Drawer**.
  - 👥 **Clients**: Client directory, credential generation, direct links to provisioned Google Drive folders, and client detail modals.
  - 📁 **Projects**: Master project tracker with budget/amount editing, client association, deliverable hub, and one-click **"Mark as Paid"** toggle.
  - 📥 **Requests**: Triage incoming work requests, inspect AI analysis, approve directly into active projects, or decline with feedback notes.
  - 🧾 **Invoices**: Dedicated invoice center with search (by invoice # or client name), status filters (`All`, `Pending`, `Paid`), financial metrics (Total Billed, Total Collected, Total Pending), live preview, editing, and deletion.
- **Quick Deliverable Feature**:
  - Rapid deliverable modal with automatic client notification email lookup from Firebase RTDB and MongoDB.
  - Auto-linked Google Drive folder URLs pre-filled for each client.
  - Download permission toggle and direct notification email dispatch.
- **Automated Client Folder Provisioning**: Creates client folders directly in Google Drive upon client setup or project kickoff.

### AI Brief Planner & Voice Scoping
- Powered by **Google Gemini API (`@google/genai` & `@google/generative-ai`)**.
- **Voice Dictation**: Dictate briefs using browser-native speech recognition (`webkitSpeechRecognition` / `SpeechRecognition`).
- Scoping Engine: Analyzes raw prompts, suggests deliverable formats, turnaround times, asks clarifying questions, and calculates cost estimations based on studio rate charts.

### Deliverables & Revisions
- Direct file uploads via Multer alongside Google Drive/external cloud storage links.
- Full review lifecycle: `In Review` / `Awaiting Client Approval`, `Approved`, `Revision Requested`, and `Superseded`.
- Version tracking and structured revision feedback history.

### Invoicing & Billing Engine
- **Interactive Invoice Generator (`InvoiceGeneratorModal.jsx`)**:
  - Sequential invoice numbering (`#001`, `#002`, etc.) via `generateNextInvoiceNumber`.
  - Multi-item line entry: Description, Quantity, Unit Rate, and automated row totals.
  - Dynamic financial calculations: Subtotal, Discount, Tax/GST %, Advance payments, and Remaining Balance Due.
  - Bank transaction details: Account Name, Account Number, IFSC Code, Bank Name, and Branch (persisted in local storage).
  - Digital signature image upload (persisted across sessions).
  - Synchronized directly to Firebase Realtime Database (`clients/${clientId}/invoices`).
- **Live Invoice Preview (`InvoicePreviewModal.jsx`)**:
  - Realistic preview modal matching official printed invoice layout prior to download or dispatch.
- **Client-Side PDF Generator (`generateCustomInvoicePdf` via `jspdf` & `jspdf-autotable`)**:
  - Generates branded, vector-sharp PDF invoices with formatted currency (`Rs.`), bank details table, digital signature, and company email.
- **Accurate Payment Math**:
  - Prevents negative pending amounts with bounded calculations (`Math.max(0, amt - adv)`).
  - Separate filters for settled vs remaining amounts.

### High-Deliverability Email Notifications (Brevo)
- Powered by the official **Brevo API (`@getbrevo/brevo`)** REST client.
- Sends responsive, anti-spam optimized HTML emails directly into the client's inbox:
  - **New Deliverable Upload**: Instant alert with clickable button to review inside the portal.
  - **Request Approved / Rejected**: Client notification with admin feedback.
  - **Payment & Invoice Reminders**: Formal statement notices with the generated **Invoice PDF attached as a Base64 buffer**.
  - **Admin Alerts**: Immediate notification whenever a client submits a new work request or approves/revises a deliverable.

### Google Drive Automation
- Integrated with **Google Drive API v3 (`googleapis`)**.
- Supports flexible credential configuration:
  - Raw JSON string via `GOOGLE_SERVICE_ACCOUNT_JSON` (ideal for containerized/serverless platforms like Render & Vercel).
  - Render Secret File path (`/etc/secrets/service-account.json`).
  - Service Account file path via `GOOGLE_SERVICE_ACCOUNT_FILE`.
  - Individual environment keys (`GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`).
  - OAuth2 Refresh Token credentials.
- Automatic creation and permission configuration of client folders.

---

## Tech Stack

### Frontend
- **Framework**: React 18 (SPA)
- **Bundler & Tooling**: Vite 5
- **Routing**: React Router DOM v6
- **Authentication & Realtime Database**: Firebase Auth & Firebase Realtime Database
- **Typography & Styling**: Google Fonts (*Plus Jakarta Sans*, *Inter*, *DM Sans*), CSS Variables, Dark & Light Mode theme engine
- **PDF Generation**: `jspdf`, `jspdf-autotable`
- **Speech Recognition**: Browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`)

### Backend
- **Runtime**: Node.js
- **Server Framework**: Express 5
- **Database**: MongoDB (Mongoose ODM v9) & Firebase Admin SDK
- **Transactional Email**: Brevo REST API (`@getbrevo/brevo` v6)
- **AI Engine**: Google Gemini API (`@google/genai` v2 & `@google/generative-ai` v0.24)
- **Cloud Storage & Integrations**: Google APIs (`googleapis` v176 Drive API v3)
- **File Handling & Document Utilities**: Multer v2, PDFKit

---

## Project Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                             Client Browser                             │
│       (React 18 + Vite SPA • Dark/Light Engine • Speech-to-Text)       │
└──────────────┬─────────────────────────┬───────────────────────────────┘
               │                         │
      Firebase Auth & RTDB        REST API Requests
  (Users, Clients & Invoices)            │
               │                         ▼
               ▼              ┌──────────────────────────────────────────┐
    ┌──────────────────────┐  │              Express Server              │
    │   Firebase Backend   │  │          (Node.js + Middleware)          │
    │  • Auth Sessions     │  └──────┬───────────┬───────────┬───────────┘
    │  • Realtime Data     │         │           │           │
    │  • Client Invoices   │         │           │           │
    └──────────────────────┘         ▼           ▼           ▼
                         ┌──────────────┐ ┌──────────────┐ ┌─────────────┐
                         │   MongoDB    │ │  Brevo API   │ │Google Gemini│
                         │   Atlas      │ │ (Inbox Email │ │  AI Planner │
                         │  (Projects & │ │ & Invoices)  │ └─────────────┘
                         │Deliverables) │ └──────────────┘
                         └──────┬───────┘
                                │
                                ▼
                         ┌──────────────┐
                         │ Google Drive │
                         │   API (v3)   │
                         └──────────────┘
```

---

## Directory Structure

```plaintext
gtclientportal/
├── api/                           # Serverless entrypoint (for Vercel deployment)
│   └── index.js
├── public/                        # Static public assets (favicons, logos)
├── server/                        # Express backend server
│   ├── config/                    # Database & service configurations (MongoDB)
│   ├── middleware/                # Express middleware (Auth, error handling)
│   ├── models/                    # Mongoose database models
│   │   ├── ClientEmail.js         # Client email & notification mappings
│   │   ├── Deliverable.js         # Deliverable files, links & review states
│   │   ├── Project.js             # Projects, budgets, amounts & status
│   │   ├── RevisionRequest.js     # Client revision notes & checklists
│   │   └── WorkRequest.js         # Work brief submissions & AI scopes
│   ├── routes/                    # API route handlers
│   │   ├── aiPlanner.js           # Gemini AI brief generation & scoping
│   │   ├── deliverables.js        # File upload, download toggles & reviews
│   │   ├── drive.js               # Google Drive folder provisioning & status
│   │   ├── projects.js            # Project tracking, amounts & status
│   │   └── workRequests.js        # Work brief submissions & approvals
│   ├── services/                  # Business logic (Gemini, Google Drive)
│   │   ├── geminiPlanner.js
│   │   └── googleDriveService.js
│   ├── utils/                     # Email notifications (Brevo) & helpers
│   │   ├── getClientEmail.js
│   │   └── sendEmail.js
│   ├── index.js                   # Express server entry point
│   ├── package.json               # Backend dependencies
│   └── service-account.json       # Google Cloud Service Account credentials (gitignored)
├── src/                           # React frontend source
│   ├── api/                       # Frontend API client modules
│   │   ├── config.js              # Base API URL setup
│   │   ├── deliverables.js        # Deliverables API calls
│   │   ├── invoices.js            # Firebase invoice CRUD & numbering helpers
│   │   ├── projects.js            # Projects API calls
│   │   └── workRequests.js        # Work requests API calls
│   ├── components/                # UI components & modals
│   │   ├── AdvanceModal.jsx       # Advance payment modal
│   │   ├── ChangePasswordModal.jsx
│   │   ├── ClientPreviewModal.jsx # Client project & deliverables viewer
│   │   ├── CredentialModal.jsx    # Client login credential popup
│   │   ├── DeliverableCard.jsx    # Deliverable item card with review actions
│   │   ├── DeliverablePreviewModal.jsx
│   │   ├── DeliverableUploadModal.jsx # Quick deliverable upload with Drive sync
│   │   ├── Header.jsx             # Top navigation bar
│   │   ├── InvoiceGeneratorModal.jsx  # Interactive invoice builder
│   │   ├── InvoicePreviewModal.jsx    # Live invoice preview modal
│   │   ├── InvoicePrint.jsx       # Print-friendly invoice view
│   │   ├── ProjectDeliverablesSection.jsx
│   │   ├── ThemeToggle.jsx        # Dark/Light theme switcher with mobile pill
│   │   ├── Toast.jsx              # Application notification toasts
│   │   ├── WorkModal.jsx          # Client work items & payment breakdown
│   │   ├── WorkRequestForm.jsx    # AI request form with voice dictation
│   │   └── WorkRequestsPanel.jsx  # Admin work request triage panel
│   ├── contexts/                  # React Contexts (AuthContext, ThemeContext)
│   ├── pages/                     # Application pages
│   │   ├── AdminDashboard.jsx     # Tabbed Admin control panel (Dashboard, Clients, Projects, Requests, Invoices)
│   │   ├── AuthPage.jsx           # Sign in & authentication page
│   │   └── ClientPortal.jsx       # Client project dashboard & Invoices tab
│   ├── App.jsx                    # Root component & Route guards
│   ├── firebase.js                # Frontend Firebase initialization
│   ├── generateInvoice.js         # Client-side PDF invoice generator
│   ├── index.css                  # Core CSS design system & variables
│   ├── main.jsx                   # React DOM render root
│   ├── theme.css                  # Modern theme overrides & typography
│   └── utils.js                   # UI & financial calculations
├── index.html                     # HTML root template with Plus Jakarta Sans & Inter fonts
├── package.json                   # Root package.json (Frontend + shared scripts)
├── render.yaml                    # Render backend deployment configuration
├── vercel.json                    # Vercel frontend rewrite configuration
└── vite.config.js                 # Vite build configuration
```

---

## Prerequisites

Ensure you have the following installed and configured before running locally:

- **Node.js**: v18.x, v20.x, or later
- **npm**: v9+ (or **pnpm** / **yarn**)
- **MongoDB**: Local MongoDB instance or free cloud cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- **Firebase Project**: Created in [Firebase Console](https://console.firebase.google.com/) with:
  - Email/Password Authentication enabled.
  - Realtime Database enabled.
- **Brevo Account**: Free account on [Brevo](https://www.brevo.com/) for transactional email API key.
- **Google Cloud Service Account** *(Required for Drive automation)*:
  - Enabled Google Drive API.
  - Downloaded service account JSON key file (`service-account.json`) or JSON string.
- **Google Gemini API Key**: From [Google AI Studio](https://aistudio.google.com/).

---

## Getting Started

### 1. Clone Repository
```bash
git clone https://github.com/gt228-tan/gtedits_clientportal.git
cd gtclientportal
```

### 2. Install Dependencies

Install root (frontend) dependencies:
```bash
npm install
```

Install backend dependencies:
```bash
cd server
npm install
cd ..
```

### 3. Configure Environment Variables

Create `.env` in the project root:
```env
# Frontend environment variables
VITE_API_URL=http://localhost:3001/api
```

Create `server/.env` inside the `server/` directory:
```env
# Server configuration
PORT=3001
CLIENT_URL=http://localhost:5173
SERVER_URL=http://localhost:3001

# Database
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/gtclientportal?retryWrites=true&w=majority

# Brevo Transactional Email API (Direct inbox delivery)
BREVO_API_KEY=your_brevo_api_key_here
BREVO_SENDER_EMAIL=gtportal08@gmail.com
BREVO_SENDER_NAME=GT Edits
ADMIN_EMAIL=your-admin-email@gmail.com

# Google Gemini AI
GEMINI_API_KEY=your_gemini_api_key

# Google Drive Integration (Option A: Raw JSON string, Option B: File path)
GOOGLE_SERVICE_ACCOUNT_JSON=
GOOGLE_SERVICE_ACCOUNT_FILE=./service-account.json
GOOGLE_DRIVE_PARENT_FOLDER_ID=your_google_drive_folder_id
```

> [!TIP]
> For cloud deployments (e.g. Render or Vercel), paste your entire `service-account.json` content as a string into `GOOGLE_SERVICE_ACCOUNT_JSON` to avoid uploading credential files.

### 4. Run in Development Mode

You can run both services concurrently:

#### Start Backend Server:
```bash
npm run server
# Or from the server directory:
# cd server && node index.js
```
*API will run on [http://localhost:3001](http://localhost:3001)*

#### Start Frontend Client:
```bash
npm run dev
```
*Frontend will run on [http://localhost:5173](http://localhost:5173)*

---

## Environment Variables Reference

### Frontend (`.env`)

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `VITE_API_URL` | Base URL for the Express backend API | `http://localhost:3001/api` |

### Backend (`server/.env`)

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `PORT` | Port for the Express server to listen on | `3001` |
| `CLIENT_URL` | Allowed origin for CORS (Frontend application URL) | `http://localhost:5173` |
| `SERVER_URL` | Self server URL used for webhook callbacks or links | `http://localhost:3001` |
| `MONGO_URI` | MongoDB Atlas connection string | `mongodb+srv://...` |
| `BREVO_API_KEY` | Brevo API key for transactional emails | `xkeysib-...` |
| `BREVO_SENDER_EMAIL`| Sender email address registered with Brevo | `gtportal08@gmail.com` |
| `BREVO_SENDER_NAME` | Sender display name | `GT Edits` |
| `ADMIN_EMAIL` | Admin email address receiving system alerts | `admin@example.com` |
| `GEMINI_API_KEY` | Google Gemini API key for brief planner | `AIzaSy...` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full stringified JSON credentials for Google Drive | `{"type":"service_account",...}` |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | Relative/absolute path to service account JSON key | `./service-account.json` |
| `GOOGLE_DRIVE_PARENT_FOLDER_ID` | Root parent folder ID in Google Drive | `16t_...` |

---

## API Routes Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **GET** | `/api` | Server health check endpoint |
| **POST** | `/api/ai-planner/analyze` | Analyzes brief, generates questions, scoping & turnaround |
| **GET** | `/api/work-requests` | List client work requests |
| **POST** | `/api/work-requests` | Submit a new work request brief |
| **GET** | `/api/work-requests/client-email` | Fetch client's notification email and default Drive folder |
| **POST** | `/api/work-requests/client-email` | Save or update client's notification email |
| **GET** | `/api/work-requests/:id` | Retrieve single work request details |
| **PUT** | `/api/work-requests/:id` | Update work request details |
| **PATCH** | `/api/work-requests/:id/status` | Update work request status |
| **POST** | `/api/work-requests/:id/approve` | Approve work request and auto-create project |
| **POST** | `/api/work-requests/:id/reject` | Reject work request with admin notes |
| **DELETE** | `/api/work-requests/:id` | Remove a work request |
| **GET** | `/api/projects` | Fetch all projects (filterable by client UID/ID) |
| **POST** | `/api/projects` | Create a new project manually |
| **GET** | `/api/projects/client/mine` | Client endpoint to fetch their own projects |
| **GET** | `/api/projects/:projectId` | Fetch single project with populated work request |
| **PATCH** | `/api/projects/:projectId` | Update project metadata (title, description, budget/amount) |
| **PATCH** | `/api/projects/:projectId/status` | Update project lifecycle status & amount |
| **GET** | `/api/projects/:projectId/deliverables` | Retrieve all deliverables associated with a project |
| **POST** | `/api/deliverables/upload` | Upload a deliverable (file upload or cloud link) |
| **PATCH** | `/api/deliverables/:id/review` | Approve or request revision on a deliverable |
| **POST** | `/api/deliverables/:deliverableId/approve` | Client approves a deliverable version |
| **POST** | `/api/deliverables/:deliverableId/request-revision` | Client requests revisions with timestamped notes |
| **PATCH** | `/api/deliverables/:deliverableId/toggle-download` | Toggle whether client can download the deliverable file |
| **DELETE** | `/api/deliverables/:deliverableId` | Delete a deliverable item |
| **POST** | `/api/deliverables/:deliverableId/remind-payment` | Send payment reminder email with PDF invoice attached |
| **POST** | `/api/drive/create-client-folder` | Provision a dedicated Google Drive folder for a client |
| **GET** | `/api/drive/status` | Check Google Drive API configuration and credential status |

---

## Deployment

### Vercel (Frontend SPA)
1. Import repository into [Vercel](https://vercel.com/).
2. Configure **Root Directory** as `./`.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Set Environment Variable:
   - `VITE_API_URL` = `https://your-backend-service.onrender.com/api`

### Render (Backend Express Service)
The repository includes a ready-to-use [`render.yaml`](render.yaml) specification:
1. Connect repository on [Render](https://render.com/).
2. Create a new **Web Service** pointing to the `server` directory.
3. Configure the following environment variables in the Render Dashboard:
   - `MONGO_URI`
   - `BREVO_API_KEY`
   - `BREVO_SENDER_EMAIL`
   - `BREVO_SENDER_NAME`
   - `ADMIN_EMAIL`
   - `CLIENT_URL`
   - `GEMINI_API_KEY`
   - `GOOGLE_SERVICE_ACCOUNT_JSON` (Paste the full JSON content)
   - `GOOGLE_DRIVE_PARENT_FOLDER_ID`

---

## License

This project is proprietary software built for **Tanishq Mehta - GT Edits**. All rights reserved.
