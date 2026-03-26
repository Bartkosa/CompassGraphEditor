import os
import socket
from pathlib import Path

from dotenv import load_dotenv
import uvicorn


def _env_bool(name: str, default: bool = False) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in {"1", "true", "yes", "y", "on"}

def _port_is_free(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        # On Windows, SO_REUSEADDR can allow binds that later fail for servers.
        # Prefer an exclusive bind check.
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            s.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try:
            s.bind((host, port))
        except OSError:
            return False
        return True


def main() -> None:
    load_dotenv(dotenv_path=Path(__file__).with_name(".env"), override=False)

    host = os.getenv("HOST", "127.0.0.1")
    reload = _env_bool("RELOAD", default=False)

    env_port = os.getenv("PORT")
    if env_port:
        port = int(env_port)
    else:
        for candidate in (8000, 8001, 8010, 8020):
            if _port_is_free(host, candidate):
                port = candidate
                break
        else:
            port = 8000

    uvicorn.run("backend.main:app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    main()

