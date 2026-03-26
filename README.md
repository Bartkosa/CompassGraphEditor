# Compass Skills Graph View

Web app that loads **skills** and **topics** from Postgres and shows them as an interactive graph: skills are grouped in columns by topic, with separate bands for lower and upper school levels. The frontend uses **React Flow** for panning, zooming, and working with nodes.

**Features**

- **Topic legend** — Click a topic in the sidebar to emphasize its skills and dim the rest.
- **Drag skills** — Move nodes on the canvas; positions survive window resize and topic highlighting until you reload the page (not saved to the database).
- **Skill details** — Click a node to open a panel with short name, full name (`skills.name`), skill `cke_code`, and topic (name, topic code, grade range).

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

Returns `topics`, `nodes`, and `edges` (edges may be empty). Each node includes fields needed for the graph and the detail panel, for example:

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

On the canvas, pan by dragging empty space, zoom with the controls or wheel, and close the detail panel with **×** or by clicking the background.
