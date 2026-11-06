"""Typed routes used unchanged by Hermes and the standalone preview."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from pydantic import Field, StringConstraints

from .csv_io import MAX_CSV_BYTES
from .errors import ServiceError
from .models import Roster, StrictModel
from .service import Edits, RosterService

Revision = Annotated[int, Field(ge=1)]
CandidateId = Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{32}$")]


class EmptyBody(StrictModel):
    pass


class RevisionBody(StrictModel):
    expected_revision: Revision


class CandidateBody(RevisionBody):
    candidate_id: CandidateId


class ChangesBody(RevisionBody):
    changes: Edits


class RosterBody(StrictModel):
    roster: Roster
    expected_revision: Revision | None = None


class CsvBody(StrictModel):
    content: Annotated[str, Field(min_length=1, max_length=MAX_CSV_BYTES)]
    expected_revision: Revision | None = None


class ErrorRoute(APIRoute):
    def get_route_handler(self) -> Callable[..., Any]:
        original = super().get_route_handler()

        async def handler(request: Request) -> Response:
            try:
                return await original(request)
            except ServiceError as exc:
                raise HTTPException(
                    status_code=exc.status, detail={"code": exc.code, "message": exc.message}
                ) from exc
            except RequestValidationError as exc:
                first = exc.errors()[0]
                location = ".".join(str(part) for part in first["loc"])
                raise HTTPException(
                    status_code=422,
                    detail={"code": "invalid_input", "message": f"{location}: {first['msg']}"},
                ) from exc

        return handler


def create_router(service_factory: Callable[[], RosterService]) -> APIRouter:
    router = APIRouter(route_class=ErrorRoute)
    dependency = Depends(service_factory)

    @router.get("/board")
    def board(service: RosterService = dependency) -> dict[str, Any]:
        return {"board": service.get_board()}

    @router.post("/demo")
    def demo(payload: EmptyBody, service: RosterService = dependency) -> dict[str, Any]:
        return {"board": service.load_demo()}

    @router.post("/roster")
    def roster(payload: RosterBody, service: RosterService = dependency) -> dict[str, Any]:
        return {"board": service.import_roster(payload.roster, payload.expected_revision)}

    @router.post("/changes")
    def changes(payload: ChangesBody, service: RosterService = dependency) -> dict[str, Any]:
        return {"board": service.change(
            payload.expected_revision, [edit.model_dump(mode="json") for edit in payload.changes]
        )}

    @router.post("/solve")
    def solve(payload: RevisionBody, service: RosterService = dependency) -> dict[str, Any]:
        return {"board": service.solve(payload.expected_revision)}

    @router.post("/apply")
    def apply(payload: CandidateBody, service: RosterService = dependency) -> dict[str, Any]:
        return {"board": service.apply(payload.expected_revision, payload.candidate_id)}

    @router.post("/discard")
    def discard(payload: CandidateBody, service: RosterService = dependency) -> dict[str, Any]:
        return {"board": service.discard(payload.expected_revision, payload.candidate_id)}

    @router.post("/undo")
    def undo(payload: RevisionBody, service: RosterService = dependency) -> dict[str, Any]:
        return {"board": service.undo(payload.expected_revision)}

    @router.get("/export")
    def export(
        kind: Literal["schedule", "project"] = "schedule", service: RosterService = dependency
    ) -> dict[str, Any]:
        return service.export_csv(kind)

    @router.post("/import")
    def import_csv(payload: CsvBody, service: RosterService = dependency) -> dict[str, Any]:
        return {"board": service.import_csv(payload.content, payload.expected_revision)}

    return router


def create_app(data_dir: Path, preview_dir: Path | None = None) -> FastAPI:
    app = FastAPI(title="ShiftRepair local preview", docs_url="/api/docs", redoc_url=None)
    app.include_router(
        create_router(lambda: RosterService(data_dir)), prefix="/api/plugins/shiftrepair"
    )
    assets = preview_dir or Path(__file__).resolve().parent.parent / "preview"
    if assets.is_dir() and (assets / "index.html").is_file():
        app.mount("/", StaticFiles(directory=assets, html=True), name="preview")
    else:
        @app.get("/")
        def missing_preview() -> dict[str, str]:
            return {
                "message": "The API is running. Build desktop assets with npm run build in desktop/.",
                "api_docs": "/api/docs",
            }
    return app
