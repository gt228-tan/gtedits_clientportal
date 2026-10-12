# EditDesk - Client Portal by GT Edits 

A modern, full-stack client portal and creative operations management platform designed for video editing studios, agencies, and freelance creatives. Built with **React 18**, **Vite**, **Express**, **MongoDB**, **Firebase Auth & Realtime Database**, and powered by **Google Gemini AI**.

---

## Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
  - [Client Portal](#-client-portal)
  - [Admin Dashboard](#-admin-dashboard)
  - [AI Brief Planner & Scoping](#-ai-brief-planner--scoping)
  - [Deliverables & Revisions](#-deliverables--revisions)
  - [Invoicing & Payments](#-invoicing--payments)
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
  - [Vercel (Frontend & Serverless API)](#vercel-frontend--serverless-api)
  - [Render (Backend Express Service)](#render-backend-express-service)
- [License](#-license)

---

## Overview

The **EditDesk - Client Portal by GT Edits** bridges the communication and delivery gap between video editors/creative agencies and their clients. It replaces fragmented WhatsApp chats, email threads, and untracked file transfers with a unified workspace offering:

- Transparent project progress and timeline tracking.
- Client work request submissions with AI-driven brief generation.
- Secure deliverable review, previewing, and revision management.
- Automated Google Drive client folder provisioning and file syncing.
- Itemized professional invoice generation (PDF) and advance payment workflows.
- Role-based access control (Admin vs. Client) and custom themes (Light / Dark mode).

---

##  Key Features

###  Client Portal
- **Dashboard Overview**: Immediate view of active projects, deliverables pending approval, completed milestones, and pending invoices.
- **AI-Assisted Request Submission**: Interactive form that lets clients describe their requirements, answer clarifying questions, and generate a scoped brief.
- **Interactive Deliverables Review**: Stream and preview video/image deliverables directly inside the portal with playback controls and watermarking indicators.
- **Itemized Revision Requests**: Submit timestamped feedback, notes, and revision checklists directly against specific deliverables.
- **Invoices & Receipts**: View billing breakdowns, advance payment confirmations, and download official PDF invoices.
- **Meeting Scheduling**: Integrated one-click booking via Calendly.
- **Theme Switcher**: Fluid toggle between Dark and Light mode.

###  Admin Dashboard
- **Client Management**: Create and manage client accounts, auto-generate login credentials, and view active client directory.
- **Work Request Triage**: Review incoming requests, refine scopes, approve into active projects, or decline with feedback.
- **Project Tracker**: Monitor project budgets, deadlines, advance payment receipts, and overall delivery statuses.
- **Deliverable Hub**: Upload video/image files, attach Google Drive or external links, configure watermark flags, and track review states.
- **Automated Client Folder Creation**: Automatically generates dedicated Google Drive folders for new clients using Google Drive API.
- **Automated Email Notifications**: Sends automated branded emails to clients upon project milestones, deliverable uploads, and status changes via Nodemailer.

### AI Brief Planner & Scoping
- Integrated with **Google Gemini (`@google/genai` / `@google/generative-ai`)**.
- Analyzes unstructured project briefs, calculates suggested turnaround times, recommends deliverable formats, identifies missing details, and generates clarifying questions.

### Deliverables & Revisions
- Direct upload support (via Multer) alongside cloud storage links.
- Review lifecycle states: `In Review`, `Approved`, `Revision Requested`, and `Completed`.
- Revision history tracking to keep client and editor feedback organized.

###  Invoicing & Payments
- Automated client PDF invoice generation using `jspdf` and `jspdf-autotable`.
- Advance payment logging and balance calculation with UPI/Bank payment support.

### Google Drive Automation
- Integrated with Google Drive API v3 using a Google Cloud Service Account.
- Automatic creation of client parent and sub-folders with configured permissions.

---

##  Tech Stack

### Frontend
- **Framework**: React 18 (SPA)
- **Bundler & Tooling**: Vite 5
- **Routing**: React Router DOM v6
- **Authentication & Realtime Sync**: Firebase Auth & Firebase Realtime Database
- **Styling**: Modern Vanilla CSS Design System with CSS Variables (Dark & Light themes)
- **PDF Generation**: `jspdf`, `jspdf-autotable`, `pdfkit`

### Backend
- **Runtime**: Node.js
- **Server Framework**: Express 4 / 5
- **Database**: MongoDB (Mongoose ODM)
- **AI Engine**: Google Gemini API (`@google/genai`, `@google/generative-ai`)
- **Cloud & Storage Integration**: Google APIs (`googleapis` Drive API v3), Google Service Account
- **Mailing**: Nodemailer (SMTP)
- **File Handling**: Multer

---

##  Project Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Browser                        │
│             (React 18 + Vite SPA + Theme Engine)            │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
       Firebase Auth & RTDB            REST API Requests
               │                               │
               ▼                               ▼
    ┌──────────────────────┐      ┌───────────────────────────┐
    │       Firebase       │      │       Express Server      │
    │  • User Sessions     │      │   (Node.js + Middleware)  │
    │  • Realtime Clients  │      └──────┬─────────────┬──────┘
    └──────────────────────┘             │             │
                                         │             ▼
                 ┌───────────────────────┤      ┌──────────────┐
                 │                       │      │ MongoDB Atlas│
                 ▼                       ▼      │  (Projects,  │
        ┌─────────────────┐    ┌──────────────┐ │ Deliverables,│
        │  Google Gemini  │    │ Google Drive │ │   Requests)  │
        │    AI Planner   │    │  API (v3)    │ └──────────────┘
        └─────────────────┘    └──────────────┘
```

---

##  Directory Structure

```plaintext
gtclientportal/
├── api/                           # Serverless entrypoint (for Vercel deployment)
│   └── index.js
├── public/                        # Static public assets
├── server/                        # Express backend server
│   ├── config/                    # Database & service configurations (MongoDB)
│   ├── middleware/                # Express middleware (Auth, validation)
│   ├── models/                    # Mongoose database models
│   │   ├── ClientEmail.js
│   │   ├── Deliverable.js
│   │   ├── Project.js
│   │   ├── RevisionRequest.js
│   │   └── WorkRequest.js
│   ├── routes/                    # API route handlers
│   │   ├── aiPlanner.js           # Gemini AI brief generation
│   │   ├── deliverables.js        # File upload & review status
│   │   ├── drive.js               # Google Drive folder provisioning
│   │   ├── projects.js            # Project tracking & status
│   │   └── workRequests.js        # Work brief submissions & approvals
│   ├── services/                  # Business logic (Gemini, Google Drive)
│   ├── utils/                     # Email notifications & helpers
│   ├── index.js                   # Express server entry point
│   ├── package.json               # Backend dependencies
│   └── service-account.json       # Google Cloud Service Account credentials (gitignored)
├── src/                           # React frontend source
│   ├── api/                       # Frontend API client modules
│   │   ├── config.js              # Base API URL setup
│   │   ├── deliverables.js
│   │   ├── projects.js
│   │   └── workRequests.js
│   ├── components/                # Reusable UI components & modals
│   │   ├── AdvanceModal.jsx
│   │   ├── ChangePasswordModal.jsx
│   │   ├── ClientPreviewModal.jsx
│   │   ├── CredentialModal.jsx
│   │   ├── DeliverableCard.jsx
│   │   ├── DeliverablePreviewModal.jsx
│   │   ├── DeliverableUploadModal.jsx
│   │   ├── Header.jsx
│   │   ├── InvoicePrint.jsx
│   │   ├── ProjectDeliverablesSection.jsx
│   │   ├── ThemeToggle.jsx
│   │   ├── Toast.jsx
│   │   ├── WorkModal.jsx
│   │   ├── WorkRequestForm.jsx
│   │   └── WorkRequestsPanel.jsx
│   ├── contexts/                  # React Contexts (AuthContext)
│   ├── pages/                     # Application pages
│   │   ├── AdminDashboard.jsx     # Admin control panel
│   │   ├── AuthPage.jsx           # Sign in & authentication page
│   │   └── ClientPortal.jsx       # Client project dashboard
│   ├── App.jsx                    # Root component & Route guards
│   ├── firebase.js                # Frontend Firebase initialization
│   ├── generateInvoice.js         # Client-side PDF invoice generator
│   ├── index.css                  # Core CSS design system & variables
│   ├── main.jsx                   # React DOM render root
│   ├── theme.css                  # Theme overrides
│   └── utils.js                   # UI utilities
├── index.html                     # HTML root template
├── package.json                   # Root package.json (Frontend + shared scripts)
├── render.yaml                    # Render backend deployment configuration
├── vercel.json                    # Vercel frontend rewrite configuration
└── vite.config.js                 # Vite build configuration
```

---

##  Prerequisites

Ensure you have the following installed and configured before running locally:

- **Node.js**: v18.x or v20.x
- **npm**: v9+ or **yarn** / **pnpm**
- **MongoDB**: Local MongoDB instance or free cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- **Firebase Project**: Created in [Firebase Console](https://console.firebase.google.com/) with:
  - Email/Password Authentication enabled.
  - Realtime Database enabled.
- **Google Cloud Service Account** *(Optional but required for Drive sync)*:
  - Enabled Google Drive API.
  - Downloaded service account JSON key file (`service-account.json`).
- **Google Gemini API Key**: From [Google AI Studio](https://aistudio.google.com/).

---

##  Getting Started

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

# Database
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/gtclientportal?retryWrites=true&w=majority

# Email Notifications (SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
ADMIN_EMAIL=your-admin-email@gmail.com

# Google Gemini AI
GEMINI_API_KEY=your_gemini_api_key

# Google Drive Integration
GOOGLE_SERVICE_ACCOUNT_FILE=./service-account.json
GOOGLE_DRIVE_PARENT_FOLDER_ID=your_google_drive_folder_id
```

Place your Google Cloud Service Account file in `server/service-account.json` if using Google Drive integration.

### 4. Run in Development Mode

You can run both services concurrently:

#### Start Backend Server:
```bash
# In one terminal
npm run server
# Or from the server directory:
# cd server && node index.js
```
*API will run on [http://localhost:3001](http://localhost:3001)*

#### Start Frontend Client:
```bash
# In another terminal
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
| `CLIENT_URL` | Allowed origin(s) for CORS | `http://localhost:5173` |
| `MONGO_URI` | MongoDB connection URI string | `mongodb+srv://...` |
| `EMAIL_HOST` | SMTP server host | `smtp.gmail.com` |
| `EMAIL_PORT` | SMTP port | `587` |
| `EMAIL_USER` | SMTP sender email address | `example@gmail.com` |
| `EMAIL_PASS` | SMTP application password | `xxxx xxxx xxxx xxxx` |
| `ADMIN_EMAIL` | Administrator email receiving alerts | `admin@example.com` |
| `GEMINI_API_KEY` | Google Gemini API key for brief planner | `AIzaSy...` |
| `GOOGLE_SERVICE_ACCOUNT_FILE`| Relative/absolute path to service account JSON | `./service-account.json` |
| `GOOGLE_DRIVE_PARENT_FOLDER_ID` | Parent folder ID in Google Drive | `16t_...` |

---

##  API Routes Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **GET** | `/api` | Server health check endpoint |
| **POST** | `/api/ai-planner/analyze` | Analyzes brief, generates clarifying questions & scoping breakdown |
| **GET** | `/api/work-requests` | List client work requests |
| **POST** | `/api/work-requests` | Submit a new work request brief |
| **PATCH** | `/api/work-requests/:id/status` | Update work request status (Approve / Reject) |
| **GET** | `/api/projects` | Fetch all active and archived projects |
| **POST** | `/api/projects` | Create a new project (or convert from work request) |
| **PATCH** | `/api/projects/:id` | Update project metadata, advance payment, or status |
| **GET** | `/api/projects/:id/deliverables` | Retrieve deliverables associated with a project |
| **POST** | `/api/deliverables/upload` | Upload a deliverable (file or link) |
| **PATCH** | `/api/deliverables/:id/review` | Approve or request revision on a deliverable |
| **POST** | `/api/drive/create-client-folder`| Provision a dedicated Google Drive folder for a client |
| **GET** | `/api/drive/status` | Check Google Drive API configuration status |

---


## License

This project is proprietary software built for **Tanishq Mehta - GT Edits**. All rights reserved.
