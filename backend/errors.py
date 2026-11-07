"""Единый формат ошибок API: { "error": { "code", "message" } }."""

from __future__ import annotations

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    """Доменная ошибка, которую клиент получает в общем конверте."""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def error_payload(code: str, message: str) -> dict[str, object]:
    return {"error": {"code": code, "message": message}}


def _no_store(payload: dict[str, object], status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=payload,
        headers={"Cache-Control": "no-store"},
    )


async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
    return _no_store(error_payload(exc.code, exc.message), exc.status_code)


async def http_error_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    codes = {
        404: "not_found",
        405: "method_not_allowed",
        429: "rate_limited",
    }
    code = codes.get(exc.status_code, "http_error")
    message = exc.detail if isinstance(exc.detail, str) else "Ошибка запроса"
    return _no_store(error_payload(code, message), exc.status_code)


async def validation_error_handler(
    _: Request, exc: RequestValidationError
) -> JSONResponse:
    fields: list[str] = []
    for error in exc.errors():
        location = ".".join(str(part) for part in error["loc"] if part != "body")
        message = str(error["msg"])
        fields.append(f"{location}: {message}" if location else message)

    message = "Проверь входные данные"
    if fields:
        message = f"{message}: {'; '.join(fields)}"

    return _no_store(error_payload("validation_error", message), 422)
