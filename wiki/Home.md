# Checklist Management System - Wiki

Welcome to the documentation for the Checklist Management System.

## Documentation Pages

### Design Documentation

1. **[Visual Blueprints: Front-End](1-Visual-Blueprints-Frontend)**
   - High-fidelity wireframes
   - Critical user paths (Operator & Admin flows)
   - Loading, Error, and Success states
   - Responsive design breakpoints
   - Color scheme

2. **[Technical Blueprints: Back-End](2-Technical-Blueprints-Backend)**
   - Data Models (ERD with Mermaid)
   - API Specification (REST endpoints)
   - System Architecture diagrams
   - Sequence diagrams for key flows
   - Technology stack

---

## Quick Links

- **Frontend:** React 18 with React Router 6, Redux Toolkit, Vite
- **Backend:** Express.js with TypeScript
- **Storage:** JSON file (data.json)
- **Auth:** JWT (jsonwebtoken)

## Project Structure

```
GalloSanitizationMVP/
├── packages/
│   ├── backend/           # Express.js API server
│   │   ├── src/
│   │   │   ├── config/    # Environment config
│   │   │   ├── data/      # JSON store & seed data
│   │   │   ├── middleware/# JWT auth
│   │   │   ├── routes/    # API endpoints
│   │   │   └── types/     # TypeScript interfaces
│   │   └── data.json      # Persistent storage
│   └── frontend/          # React application
│       └── src/
│           ├── components/# Shared UI components
│           ├── pages/     # Page components
│           ├── services/  # API client
│           └── store/     # Redux state
└── wiki/                  # Documentation
```
