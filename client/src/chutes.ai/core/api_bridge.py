"""
API Bridge for Node.js integration.

Provides JSON-only endpoints for the AI Studio Node.js backend to call.
Separates API concerns from the HTML dashboard.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import JSONResponse

from core import (
    ChuteConfig,
    ConfigManager,
    get_template_names,
    get_template,
    seed_builtin_templates,
)
from core.config_manager import ModelConfig, HardwareConfig, DockerImageConfig
from core.chutes_api_client import (
    api_get_authenticated,
    api_request_authenticated,
    probe_chutes_api,
)
from core.credentials_store import load_credentials
from core.playground_catalog import normalize_row, pick_chute_rows

router = APIRouter(prefix="/bridge", tags=["bridge"])


def _api_context() -> tuple[str, str]:
    c = load_credentials(ROOT)
    return c.effective_base_url(), c.api_key.strip()


def _manager() -> ConfigManager:
    return ConfigManager(str(ROOT / "configs"))


# === Credentials ===

@router.get("/credentials")
async def get_credentials():
    """Get current credentials status (masked)."""
    c = load_credentials(ROOT)
    return {
        "api_key_configured": bool(c.api_key.strip()),
        "api_base_url": c.effective_base_url(),
        "account_fingerprint_configured": bool(c.account_fingerprint.strip()),
    }


@router.post("/credentials/test")
async def test_credentials(api_key: str = Body(""), api_base_url: str = Body("")):
    """Test API key against Chutes HTTP API."""
    existing = load_credentials(ROOT)
    key = (api_key or "").strip() or existing.api_key
    base = (api_base_url or "").strip() or existing.api_base_url
    return probe_chutes_api(key, base)


# === Chutes (Deployed) ===

@router.get("/chutes")
async def list_chutes(
    limit: int = Query(50, ge=1, le=100),
    page: int = Query(0, ge=0),
    include_public: bool = Query(False),
    template: str = Query(""),
):
    """List user's deployed chutes from Chutes API."""
    base, key = _api_context()
    if not key:
        return JSONResponse(
            {"ok": False, "error": "Chutes API key not configured"},
            status_code=401,
        )
    q: dict = {"limit": limit, "page": page}
    if include_public:
        q["include_public"] = True
    if template.strip():
        q["template"] = template.strip()
    return api_get_authenticated(base, "/chutes/", key, query=q)


@router.get("/chutes/{chute_id:path}")
async def get_chute(chute_id: str):
    """Get details for a specific chute."""
    base, key = _api_context()
    if not key:
        return JSONResponse(
            {"ok": False, "error": "Chutes API key not configured"},
            status_code=401,
        )
    from urllib.parse import quote
    enc = quote(chute_id.strip(), safe="")
    return api_get_authenticated(base, f"/chutes/{enc}", key)


@router.delete("/chutes/{chute_id:path}")
async def delete_chute(chute_id: str, confirm: str = Query("")):
    """Delete a chute from Chutes platform."""
    base, key = _api_context()
    if not key:
        return JSONResponse(
            {"ok": False, "error": "Chutes API key not configured"},
            status_code=401,
        )
    raw = chute_id.strip()
    if confirm.strip() != raw:
        raise HTTPException(
            status_code=400,
            detail="Query param 'confirm' must match chute id",
        )
    from urllib.parse import quote
    enc = quote(raw, safe="")
    return api_request_authenticated(
        "DELETE", base, f"/chutes/{enc}", key, timeout=120.0
    )


@router.get("/chutes/{chute_id:path}/warmup")
async def warmup_chute(chute_id: str):
    """Warm up a chute (bring online)."""
    base, key = _api_context()
    if not key:
        return JSONResponse(
            {"ok": False, "error": "Chutes API key not configured"},
            status_code=401,
        )
    from urllib.parse import quote
    enc = quote(chute_id.strip(), safe="")
    return api_get_authenticated(base, f"/chutes/warmup/{enc}", key)


# === My Private Chutes (for model discovery) ===

@router.get("/my-chutes")
async def list_my_chutes():
    """List user's private chutes formatted for AI Studio model discovery."""
    base, key = _api_context()
    if not key:
        return JSONResponse(
            {"ok": False, "error": "Chutes API key not configured"},
            status_code=401,
        )
    
    # Fetch user's chutes (not public)
    q: dict = {"limit": 100, "page": 0, "include_public": False}
    r = api_get_authenticated(base, "/chutes/", key, query=q)
    
    if not r.get("ok"):
        return JSONResponse(
            {"ok": False, "error": r.get("error"), "detail": r},
            status_code=502,
        )
    
    rows = pick_chute_rows(r.get("data"))
    models: List[Dict[str, Any]] = []
    
    for row in rows:
        normalized = normalize_row(row)
        if not normalized:
            continue
        
        # Determine category based on template type
        tmpl = normalized.get("template", "other")
        category = "chat"  # default
        if tmpl in ("image_generation", "diffusion", "image"):
            category = "image"
        elif tmpl == "video":
            category = "video"
        elif tmpl in ("tts", "text_to_speech"):
            category = "tts"
        elif tmpl in ("speech_to_text", "speech"):
            category = "speech"
        elif tmpl in ("music_generation", "music"):
            category = "music"
        elif tmpl in ("embeddings", "embedding"):
            category = "embeddings"
        
        models.append({
            "id": f"chutes-private/{normalized['name']}",
            "name": normalized["name"],
            "displayName": normalized["name"],
            "provider": "chutes-private",
            "categories": [category],
            "base_url": normalized["base_url"],
            "chute_id": normalized.get("chute_id"),
            "public": normalized.get("public", False),
            "hot": normalized.get("hot", False),
            "price_per_hour": normalized.get("price_per_hour"),
            "tagline": normalized.get("tagline", ""),
        })
    
    return {"ok": True, "models": models, "total": len(models)}


# === Configs (Local YAML) ===

@router.get("/configs")
async def list_configs():
    """List local chute configurations."""
    m = _manager()
    names = m.list_configs()
    configs: List[Dict[str, Any]] = []
    for name in names:
        try:
            cfg = m.load_config(name)
            configs.append({
                "name": name,
                "chute_type": cfg.chute_type,
                "username": cfg.username,
                "model": cfg.model.name,
                "tagline": cfg.tagline,
            })
        except Exception as e:
            configs.append({"name": name, "error": str(e)})
    return {"ok": True, "configs": configs}


@router.get("/configs/{name}")
async def get_config(name: str):
    """Get a specific configuration."""
    m = _manager()
    if not m.config_exists(name):
        raise HTTPException(404, "Config not found")
    cfg = m.load_config(name)
    return {"ok": True, "config": cfg.model_dump(mode="json")}


@router.post("/configs")
async def create_config(body: Dict[str, Any] = Body(...)):
    """Create a new configuration from template."""
    m = _manager()
    name = body.get("name", "").strip().lower().replace(" ", "-")
    if not name:
        raise HTTPException(400, "name required")
    if m.config_exists(name):
        raise HTTPException(400, f"Config {name} already exists")
    
    template_key = body.get("template", "custom")
    username = body.get("username", "")
    
    try:
        template_data = get_template(template_key)
    except ValueError:
        template_data = get_template("custom")
    
    template_data["name"] = name
    if username:
        template_data["username"] = username
    
    # Apply any overrides
    for key in ["model", "hardware", "docker", "tagline", "description"]:
        if key in body:
            template_data[key] = body[key]
    
    cfg = ChuteConfig(**template_data)
    m.save_config(cfg)
    return {"ok": True, "name": name, "config": cfg.model_dump(mode="json")}


@router.put("/configs/{name}")
async def update_config(name: str, body: Dict[str, Any] = Body(...)):
    """Update a configuration."""
    m = _manager()
    if not m.config_exists(name):
        raise HTTPException(404, "Config not found")
    
    cfg = m.load_config(name)
    data = cfg.model_dump()
    
    # Apply updates
    for key, value in body.items():
        if key == "name" and value != name:
            raise HTTPException(400, "Cannot rename config via update")
        data[key] = value
    
    cfg = ChuteConfig(**data)
    m.save_config(cfg)
    return {"ok": True, "config": cfg.model_dump(mode="json")}


@router.delete("/configs/{name}")
async def delete_config(name: str):
    """Delete a configuration."""
    m = _manager()
    if not m.delete_config(name):
        raise HTTPException(404, "Config not found")
    return {"ok": True, "deleted": name}


# === Templates ===

@router.get("/templates")
async def list_templates():
    """List available chute templates."""
    from core.templates import get_template_catalog
    return {"ok": True, "templates": get_template_catalog()}


@router.get("/templates/{key}")
async def get_template_detail(key: str):
    """Get a specific template."""
    try:
        template = get_template(key)
        return {"ok": True, "template": template}
    except ValueError as e:
        raise HTTPException(404, str(e))


# === YAML Raw ===

@router.get("/configs/{name}/yaml")
async def get_config_yaml(name: str):
    """Get raw YAML for a configuration."""
    m = _manager()
    path = m.get_config_path(name)
    if not path.exists():
        raise HTTPException(404, "Config not found")
    return {"ok": True, "yaml": path.read_text(encoding="utf-8")}


@router.put("/configs/{name}/yaml")
async def update_config_yaml(name: str, yaml_text: str = Body(..., embed=True)):
    """Update configuration from raw YAML."""
    import yaml
    m = _manager()
    try:
        data = yaml.safe_load(yaml_text)
        cfg = ChuteConfig(**data)
        if cfg.name != name:
            raise HTTPException(400, "YAML name must match URL name")
        m.save_config(cfg)
        return {"ok": True, "config": cfg.model_dump(mode="json")}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Invalid YAML: {e}")
