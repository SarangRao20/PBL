# QModule Frontend — Luminary v2.0

## Design System
**Fonts:** Instrument Serif (italic branding) · Bricolage Grotesque (headings) · Mulish (body) · JetBrains Mono (labels/code)  
**Palette:** Deep midnight navy · Violet/indigo accents · Teal highlights · Gold badges  
**Animations:** Spring bounce logins · Message entry animations · Animated orb backgrounds · Gradient progress bars · Glowing send button

---

## Quick Start

### 1. Install
```bash
cd qmodule-frontend
npm install
```

### 2. Start Flask first
```bash
# from project root
python src/app.py
# → http://localhost:5000
```

### 3. Start React dev server
```bash
npm run dev
# → http://localhost:3000  (proxied to Flask)
```

### 4. Production build
```bash
npm run build
# → ../static/dist/
```

---

## Flask Integration (Production)

Add to `app.py`:

```python
import os
from flask import send_from_directory

REACT_BUILD = os.path.join(os.path.dirname(__file__), '..', 'static', 'dist')

@app.route('/app', defaults={'path': ''})
@app.route('/app/<path:path>')
def serve_react(path):
    full = os.path.join(REACT_BUILD, path)
    if path and os.path.exists(full):
        return send_from_directory(REACT_BUILD, path)
    return send_from_directory(REACT_BUILD, 'index.html')
```

Then visit `http://localhost:5000/app`

---

## File Structure

```
src/
├── main.jsx                  # React root
├── App.jsx                   # Auth state, session check, toast provider
├── index.css                 # Full Luminary design system (CSS variables, all components)
└── components/
    ├── Login.jsx             # Spring-animated login page, role selector
    ├── Layout.jsx            # Tab shell, sidebar integration
    ├── Sidebar.jsx           # Navigation (role-aware), user badge, logout
    ├── Chat.jsx              # Full RAG chat: markdown, mermaid, TTS, sources, RLHF
    ├── Documents.jsx         # Drag & drop upload + URL scrape with job polling
    ├── KnowledgeBase.jsx     # Grouped chunks, inline edit, delete (teacher only)
    ├── Analytics.jsx         # Chart.js charts, stat cards, contributors (teacher only)
    └── Toast.jsx             # Global toast notifications
```

---

## API Endpoints Used

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/current_session` | GET | Auth check on app load |
| `/login` | POST | Form login |
| `/logout` | GET | Sign out |
| `/chat` | POST | RAG Q&A |
| `/upload` | POST | PDF/TXT upload |
| `/scrape` | POST | URL scraper |
| `/api/job/:id` | GET | Job progress polling |
| `/feedback` | POST | RLHF correction |
| `/api/knowledge_base` | GET | List chunks |
| `/api/knowledge_base/:id` | PUT | Edit chunk |
| `/api/knowledge_base/:id` | DELETE | Delete chunk |
| `/api/analytics` | GET | Stats + chart data |

---

## Credentials
| Role | Username | Password |
|------|----------|----------|
| Professor | `professor` | `admin` |
| Student | `student` | `student` |
