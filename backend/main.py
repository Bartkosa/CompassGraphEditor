import os
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from psycopg import connect
from psycopg.rows import dict_row


_DOTENV_CANDIDATES = [
    Path(__file__).with_name(".env"),
    Path.cwd() / "backend" / ".env",
    Path.cwd() / ".env",
]
for _p in _DOTENV_CANDIDATES:
    if _p.exists():
        load_dotenv(dotenv_path=_p, override=False)
        break


def _get_database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL env var is not set (check backend/.env loading)")
    return url.replace("postgresql+psycopg://", "postgresql://", 1)


def _parse_allowed_origins() -> List[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    return origins or ["http://localhost:5173"]


SkillRow = Dict[str, Any]


def _fetch_topics_and_skills() -> (List[Dict[str, Any]], List[SkillRow]):
    db_url = _get_database_url()
    with connect(db_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select
                  id,
                  cke_code as topic_cke_code,
                  name as topic_name,
                  grade_from,
                  grade_to
                from topics
                order by cke_code, id
                """
            )
            topic_rows = cur.fetchall()

            cur.execute(
                """
                select
                  skills.cke_code as skill_cke_code,
                  skills.short_name as short_name,
                  skills.name as skill_name,
                  topics.id as topic_id,
                  topics.cke_code as topic_cke_code,
                  topics.name as topic_name,
                  topics.grade_from as grade_from,
                  topics.grade_to as grade_to
                from skills
                join topics on skills.topic_id = topics.id
                order by topics.id, skills.cke_code
                """
            )
            skill_rows = cur.fetchall()

    return list(topic_rows), list(skill_rows)


def _build_graph_payload(topic_rows: List[Dict[str, Any]], skill_rows: List[SkillRow]) -> Dict[str, Any]:
    topics: List[Dict[str, Any]] = []
    for t in topic_rows:
        topics.append(
            {
                "id": t["id"],
                "topic_cke_code": str(t["topic_cke_code"]),
                "topic_name": t["topic_name"],
                "grade_from": t["grade_from"],
                "grade_to": t["grade_to"],
            }
        )

    nodes: List[Dict[str, Any]] = []
    for r in skill_rows:
        topic_code = str(r["topic_cke_code"])
        topic_id = r["topic_id"]
        skill_code = str(r["skill_cke_code"])

        skill_name = r.get("skill_name")
        topic_name = r.get("topic_name")
        nodes.append(
            {
                # ReactFlow requires unique node ids (per DB topic row, not cke_code).
                "id": f"{topic_id}:{skill_code}",
                "label": r["short_name"],
                "short_name": r["short_name"],
                "name": skill_name if skill_name is not None else "",
                "topic_id": topic_id,
                "topic_cke_code": topic_code,
                "topic_name": topic_name if topic_name is not None else "",
                "grade_from": r["grade_from"],
                "grade_to": r["grade_to"],
                "skill_cke_code": skill_code,
            }
        )

    return {"topics": topics, "nodes": nodes, "edges": []}


app = FastAPI(title="Compass Skills Graph View")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/skills-graph")
def get_skills_graph() -> Dict[str, Any]:
    try:
        topic_rows, skill_rows = _fetch_topics_and_skills()
        return _build_graph_payload(topic_rows, skill_rows)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch skills graph: {e}")

