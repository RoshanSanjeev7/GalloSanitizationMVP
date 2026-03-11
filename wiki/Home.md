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
   - Database Schema (ERD with Mermaid)
   - API Specification (REST endpoints)
   - System Architecture diagrams
   - Sequence diagrams for key flows
   - Technology stack

---

## Quick Links

- **Frontend:** React 19 with React Router
- **Backend:** Flask with SQLAlchemy
- **Database:** SQLite

## Project Structure

```
S26-CSE-311/
├── frontend/          # React application
│   └── src/
│       ├── pages/     # Page components
│       └── services/  # API client
├── backend/           # Flask server
│   ├── models/        # SQLAlchemy models
│   ├── routes/        # API blueprints
│   └── extensions/    # Database setup
└── wiki/              # Documentation
```
