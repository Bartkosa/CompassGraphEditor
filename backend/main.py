import os
import json
from pathlib import Path
from typing import Any, Dict, List, Literal, Tuple

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
PrerequisiteRow = Dict[str, Any]
NodePositions = Dict[str, Dict[str, float]]
_POSITIONS_FILE = Path(__file__).with_name("data").joinpath("node_positions.json")

GraphDataset = Literal["cke", "ma"]
_DATASETS: frozenset[str] = frozenset({"cke", "ma"})


def _parse_dataset(value: str | None) -> GraphDataset:
    v = (value or "cke").strip().lower()
    if v not in _DATASETS:
        raise HTTPException(status_code=400, detail="dataset must be 'cke' or 'ma'")
    return v  # type: ignore[return-value]


def _fetch_topics_and_skills_and_prerequisites() -> Tuple[List[Dict[str, Any]], List[SkillRow], List[PrerequisiteRow]]:
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
                  skills.id as skill_id,
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

            cur.execute(
                """
                select
                  id,
                  source_skill_id,
                  target_skill_id
                from skill_prerequisites
                order by id
                """
            )
            prerequisite_rows = cur.fetchall()

    return list(topic_rows), list(skill_rows), list(prerequisite_rows)


def _fetch_ma_topics_skills_and_prerequisites() -> Tuple[List[Dict[str, Any]], List[SkillRow], List[PrerequisiteRow]]:
    db_url = _get_database_url()
    with connect(db_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select
                  id,
                  coalesce(ma_code, '') as topic_cke_code,
                  name as topic_name,
                  coalesce(grade, 5) as grade_from,
                  coalesce(grade, 5) as grade_to
                from ma_topics
                order by ma_code nulls last, id
                """
            )
            topic_rows = cur.fetchall()

            cur.execute(
                """
                select
                  ma_skills.id as skill_id,
                  coalesce(ma_skills.ma_code, '') as skill_cke_code,
                  coalesce(ma_skills.short_name, '') as short_name,
                  ma_skills.name as skill_name,
                  ma_topics.id as topic_id,
                  coalesce(ma_topics.ma_code, '') as topic_cke_code,
                  ma_topics.name as topic_name,
                  coalesce(ma_topics.grade, 5) as grade_from,
                  coalesce(ma_topics.grade, 5) as grade_to
                from ma_skills
                join ma_topics on ma_skills.ma_topic_id = ma_topics.id
                order by ma_topics.id, ma_skills.id
                """
            )
            skill_rows = cur.fetchall()

            cur.execute(
                """
                select
                  id,
                  source_ma_skill_id as source_skill_id,
                  target_ma_skill_id as target_skill_id
                from ma_skill_prerequisites
                order by id
                """
            )
            prerequisite_rows = cur.fetchall()

    return list(topic_rows), list(skill_rows), list(prerequisite_rows)


def _normalize_positions(raw: Any) -> NodePositions:
    if not isinstance(raw, dict):
        return {}

    normalized: NodePositions = {}
    for node_id, pos in raw.items():
        if not isinstance(node_id, str) or not isinstance(pos, dict):
            continue
        x = pos.get("x")
        y = pos.get("y")
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            continue
        normalized[node_id] = {"x": float(x), "y": float(y)}
    return normalized


def _read_positions_by_dataset() -> Dict[str, NodePositions]:
    if not _POSITIONS_FILE.exists():
        return {ds: {} for ds in _DATASETS}
    try:
        content = json.loads(_POSITIONS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {ds: {} for ds in _DATASETS}

    if isinstance(content, dict) and isinstance(content.get("positionsByDataset"), dict):
        raw_by_ds = content["positionsByDataset"]
        out: Dict[str, NodePositions] = {ds: {} for ds in _DATASETS}
        for ds in _DATASETS:
            chunk = raw_by_ds.get(ds)
            if isinstance(chunk, dict):
                out[ds] = _normalize_positions(chunk)
        return out

    legacy = _normalize_positions(content.get("positions", content))
    return {"cke": legacy, "ma": {}}


def _write_positions_by_dataset_store(store: Dict[str, NodePositions]) -> None:
    _POSITIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "positionsByDataset": {ds: _normalize_positions(store.get(ds, {})) for ds in _DATASETS},
    }
    tmp_path = _POSITIONS_FILE.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
    tmp_path.replace(_POSITIONS_FILE)


def _read_node_positions_for_dataset(dataset: GraphDataset) -> NodePositions:
    return dict(_read_positions_by_dataset().get(dataset, {}))


def _write_node_positions_for_dataset(dataset: GraphDataset, positions: NodePositions) -> None:
    store = _read_positions_by_dataset()
    store[dataset] = _normalize_positions(positions)
    _write_positions_by_dataset_store(store)


def _build_graph_payload(
    topic_rows: List[Dict[str, Any]],
    skill_rows: List[SkillRow],
    prerequisite_rows: List[PrerequisiteRow],
    *,
    node_id_use_skill_id: bool = False,
) -> Dict[str, Any]:
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
    node_id_by_skill_id: Dict[int, str] = {}
    for r in skill_rows:
        skill_id = int(r["skill_id"])
        topic_code = str(r["topic_cke_code"])
        topic_id = r["topic_id"]
        skill_code = str(r["skill_cke_code"])

        skill_name = r.get("skill_name")
        topic_name = r.get("topic_name")
        node_id = f"{topic_id}:{skill_id}" if node_id_use_skill_id else f"{topic_id}:{skill_code}"
        node_id_by_skill_id[skill_id] = node_id
        nodes.append(
            {
                # ReactFlow requires unique node ids (per DB topic row, not cke_code).
                "id": node_id,
                "skill_id": skill_id,
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

    edges: List[Dict[str, Any]] = []
    for p in prerequisite_rows:
        source_skill_id = int(p["source_skill_id"])
        target_skill_id = int(p["target_skill_id"])
        source_node_id = node_id_by_skill_id.get(source_skill_id)
        target_node_id = node_id_by_skill_id.get(target_skill_id)
        if source_node_id is None or target_node_id is None:
            continue
        edges.append(
            {
                "id": f"sp:{int(p['id'])}",
                "source": source_node_id,
                "target": target_node_id,
            }
        )

    return {"topics": topics, "nodes": nodes, "edges": edges}


def _parse_prerequisite_payload(payload: Dict[str, Any]) -> Tuple[int, int]:
    source_skill_id = payload.get("source_skill_id")
    target_skill_id = payload.get("target_skill_id")
    if not isinstance(source_skill_id, int) or not isinstance(target_skill_id, int):
        raise HTTPException(status_code=400, detail="source_skill_id and target_skill_id must be integers")
    if source_skill_id == target_skill_id:
        raise HTTPException(status_code=400, detail="source_skill_id and target_skill_id must be different")
    return source_skill_id, target_skill_id


def _assert_skills_exist(cur: Any, source_skill_id: int, target_skill_id: int) -> None:
    cur.execute(
        """
        select id
        from skills
        where id in (%s, %s)
        """,
        (source_skill_id, target_skill_id),
    )
    found_ids = {int(row["id"]) for row in cur.fetchall()}
    if source_skill_id not in found_ids or target_skill_id not in found_ids:
        raise HTTPException(status_code=404, detail="One or both skill IDs do not exist")


def _assert_ma_skills_exist(cur: Any, source_ma_skill_id: int, target_ma_skill_id: int) -> None:
    cur.execute(
        """
        select id
        from ma_skills
        where id in (%s, %s)
        """,
        (source_ma_skill_id, target_ma_skill_id),
    )
    found_ids = {int(row["id"]) for row in cur.fetchall()}
    if source_ma_skill_id not in found_ids or target_ma_skill_id not in found_ids:
        raise HTTPException(status_code=404, detail="One or both skill IDs do not exist")


def _get_skills_graph_payload(ds: GraphDataset) -> Dict[str, Any]:
    if ds == "ma":
        topic_rows, skill_rows, prerequisite_rows = _fetch_ma_topics_skills_and_prerequisites()
        out = _build_graph_payload(
            topic_rows, skill_rows, prerequisite_rows, node_id_use_skill_id=True
        )
    else:
        topic_rows, skill_rows, prerequisite_rows = _fetch_topics_and_skills_and_prerequisites()
        out = _build_graph_payload(topic_rows, skill_rows, prerequisite_rows)
    out["dataset"] = ds
    return out


_GRAPH_CACHE_HEADERS = {"Cache-Control": "no-store, max-age=0, must-revalidate"}


def _skills_graph_json_response(ds: GraphDataset) -> JSONResponse:
    try:
        payload = _get_skills_graph_payload(ds)
        return JSONResponse(content=payload, headers=_GRAPH_CACHE_HEADERS)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch skills graph: {e}")


def _put_node_positions_impl(ds: GraphDataset, payload: Dict[str, Any]) -> Dict[str, Any]:
    positions = _normalize_positions(payload.get("positions", {}))
    try:
        _write_node_positions_for_dataset(ds, positions)
        return {"ok": True, "count": len(positions)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save node positions: {e}")


def _create_skill_prerequisite_impl(ds: GraphDataset, payload: Dict[str, Any]) -> Dict[str, Any]:
    source_skill_id, target_skill_id = _parse_prerequisite_payload(payload)
    db_url = _get_database_url()
    try:
        with connect(db_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                if ds == "ma":
                    _assert_ma_skills_exist(cur, source_skill_id, target_skill_id)
                    cur.execute(
                        """
                        select id
                        from ma_skill_prerequisites
                        where source_ma_skill_id = %s and target_ma_skill_id = %s
                        """,
                        (source_skill_id, target_skill_id),
                    )
                    existing = cur.fetchone()
                    if existing is not None:
                        raise HTTPException(status_code=409, detail="Prerequisite edge already exists")

                    cur.execute(
                        """
                        insert into ma_skill_prerequisites (source_ma_skill_id, target_ma_skill_id)
                        values (%s, %s)
                        returning id
                        """,
                        (source_skill_id, target_skill_id),
                    )
                else:
                    _assert_skills_exist(cur, source_skill_id, target_skill_id)
                    cur.execute(
                        """
                        select id
                        from skill_prerequisites
                        where source_skill_id = %s and target_skill_id = %s
                        """,
                        (source_skill_id, target_skill_id),
                    )
                    existing = cur.fetchone()
                    if existing is not None:
                        raise HTTPException(status_code=409, detail="Prerequisite edge already exists")

                    cur.execute(
                        """
                        insert into skill_prerequisites (source_skill_id, target_skill_id)
                        values (%s, %s)
                        returning id
                        """,
                        (source_skill_id, target_skill_id),
                    )
                created = cur.fetchone()
            conn.commit()
    except HTTPException:
        raise
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create prerequisite edge: {e}")

    return {
        "ok": True,
        "id": int(created["id"]),
        "source_skill_id": source_skill_id,
        "target_skill_id": target_skill_id,
    }


def _delete_skill_prerequisite_impl(ds: GraphDataset, payload: Dict[str, Any]) -> Dict[str, Any]:
    source_skill_id, target_skill_id = _parse_prerequisite_payload(payload)
    db_url = _get_database_url()
    try:
        with connect(db_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                if ds == "ma":
                    cur.execute(
                        """
                        delete from ma_skill_prerequisites
                        where source_ma_skill_id = %s and target_ma_skill_id = %s
                        returning id
                        """,
                        (source_skill_id, target_skill_id),
                    )
                else:
                    cur.execute(
                        """
                        delete from skill_prerequisites
                        where source_skill_id = %s and target_skill_id = %s
                        returning id
                        """,
                        (source_skill_id, target_skill_id),
                    )
                deleted = cur.fetchone()
            conn.commit()
    except HTTPException:
        raise
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete prerequisite edge: {e}")

    if deleted is None:
        raise HTTPException(status_code=404, detail="Prerequisite edge not found")
    return {
        "ok": True,
        "id": int(deleted["id"]),
        "source_skill_id": source_skill_id,
        "target_skill_id": target_skill_id,
    }


app = FastAPI(title="Compass Skills Graph View")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/skills-graph")
def get_skills_graph(dataset: str | None = Query(None)) -> JSONResponse:
    ds = _parse_dataset(dataset)
    return _skills_graph_json_response(ds)


@app.get("/api/skills-graph/{dataset_path}")
def get_skills_graph_by_path(dataset_path: str) -> JSONResponse:
    ds = _parse_dataset(dataset_path)
    return _skills_graph_json_response(ds)


@app.get("/api/node-positions")
def get_node_positions(dataset: str | None = Query(None)) -> Dict[str, NodePositions]:
    ds = _parse_dataset(dataset)
    return {"positions": _read_node_positions_for_dataset(ds)}


@app.get("/api/node-positions/{dataset_path}")
def get_node_positions_by_path(dataset_path: str) -> Dict[str, NodePositions]:
    ds = _parse_dataset(dataset_path)
    return {"positions": _read_node_positions_for_dataset(ds)}


@app.put("/api/node-positions")
def put_node_positions(
    payload: Dict[str, Any] = Body(...),
    dataset: str | None = Query(None),
) -> Dict[str, Any]:
    ds = _parse_dataset(dataset)
    return _put_node_positions_impl(ds, payload)


@app.put("/api/node-positions/{dataset_path}")
def put_node_positions_by_path(
    dataset_path: str,
    payload: Dict[str, Any] = Body(...),
) -> Dict[str, Any]:
    ds = _parse_dataset(dataset_path)
    return _put_node_positions_impl(ds, payload)


@app.post("/api/skill-prerequisites")
def create_skill_prerequisite(
    payload: Dict[str, Any] = Body(...),
    dataset: str | None = Query(None),
) -> Dict[str, Any]:
    ds = _parse_dataset(dataset)
    return _create_skill_prerequisite_impl(ds, payload)


@app.post("/api/skill-prerequisites/{dataset_path}")
def create_skill_prerequisite_by_path(
    dataset_path: str,
    payload: Dict[str, Any] = Body(...),
) -> Dict[str, Any]:
    ds = _parse_dataset(dataset_path)
    return _create_skill_prerequisite_impl(ds, payload)


@app.delete("/api/skill-prerequisites")
def delete_skill_prerequisite(
    source_skill_id: int = Query(...),
    target_skill_id: int = Query(...),
    dataset: str | None = Query(None),
) -> Dict[str, Any]:
    ds = _parse_dataset(dataset)
    payload = {
        "source_skill_id": source_skill_id,
        "target_skill_id": target_skill_id,
    }
    return _delete_skill_prerequisite_impl(ds, payload)


@app.delete("/api/skill-prerequisites/{dataset_path}")
def delete_skill_prerequisite_by_path(
    dataset_path: str,
    source_skill_id: int = Query(...),
    target_skill_id: int = Query(...),
) -> Dict[str, Any]:
    ds = _parse_dataset(dataset_path)
    payload = {
        "source_skill_id": source_skill_id,
        "target_skill_id": target_skill_id,
    }
    return _delete_skill_prerequisite_impl(ds, payload)

