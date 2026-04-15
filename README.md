# Compass Skills Graph View

Web app that loads **skills** and **topics** from Postgres and shows them as an interactive graph: skills are grouped in columns by topic, with separate bands for lower and upper school levels. The frontend uses **React Flow** for panning, zooming, and working with nodes.

**Features**

- **Datasets** — Header **Dataset** selector switches between **CKE** (`topics` / `skills`) and **MA** (`ma_topics` / `ma_skills`). Each dataset has its own saved layout and prerequisite table.
- **Topic legend** — Click a topic in the sidebar to emphasize its skills and dim the rest.
- **Find skill** — In the header: search by full name, short name, or skill code (exact match first, then substring). **Find** or **Enter** highlights all matches, brings them forward, and zooms the view to fit. **Clear** removes the highlight and query. Works well for pasted `ma_skills.name` text.
- **Save positions** — **Save positions** in the header writes the current node coordinates to `backend/data/node_positions.json`, keyed by dataset (`cke` / `ma`). Unsaved drags are kept in memory until you save or reload.
- **Prerequisites (edges)** — Drag from one skill’s handle to another to create a prerequisite (persisted in Postgres). Select an edge and press **Delete** or **Backspace** to remove it. Hold **Shift** to multi-select nodes or drag-select; status text for save/edge actions appears next to the header controls.
- **Drag skills** — Move nodes on the canvas. Positions are merged with saved layout on load and after save.
- **Skill details** — Click a node to open a panel with short name, full name, skill code (`cke_code` / MA `ma_code`), and topic (name, topic code, grade range).

**Stack**

| Part     | Tech                       |
| -------- | -------------------------- |
| Backend  | FastAPI, psycopg, Postgres |
| Frontend | React, TypeScript, Vite, `@xyflow/react` |

## Run locally

1. **Backend** — Set `DATABASE_URL` in `backend/.env` (optional: `ALLOWED_ORIGINS`, `PORT`, `HOST`). From the project root:

   ```bash
   pip install -r backend/requirements.txt
   python -m backend
   ```

2. **Frontend** — Optionally set `VITE_API_BASE_URL` to your API origin (e.g. `http://127.0.0.1:8000`):

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## API: `GET /api/skills-graph`

Query `?dataset=cke` or `?dataset=ma` (default `cke`). Returns `topics`, `nodes`, and `edges`. Each node includes fields needed for the graph and the detail panel, for example:

```json
{
  "topics": [
    {
      "id": 1,
      "topic_cke_code": "…",
      "topic_name": "…",
      "grade_from": 4,
      "grade_to": 6
    }
  ],
  "nodes": [
    {
      "id": "<topic_id>:<skill_cke_code>",
      "skill_id": 1,
      "label": "<short_name>",
      "short_name": "…",
      "name": "…",
      "topic_id": 1,
      "topic_cke_code": "…",
      "topic_name": "…",
      "grade_from": 4,
      "grade_to": 6,
      "skill_cke_code": "…"
    }
  ],
  "edges": []
}
```

**Node `id` format**

- **CKE:** `<topic_id>:<skill_cke_code>` (topic row id plus skill code string).
- **MA:** `<topic_id>:<skill_id>` (topic row id plus numeric `ma_skills.id`), because MA codes are not guaranteed unique across topics.

Related endpoints include node position read/write and creating or deleting prerequisite rows (see `backend/main.py`).

On the canvas, pan by dragging empty space, zoom with the controls or wheel, and close the detail panel with **×** or by clicking the background.
