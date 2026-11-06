from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.schema import User, WatchlistItem, WatchProgress
from app.services.auth import require_current_user

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])

class AddWatchlistRequest(BaseModel):
    drama_id: str
    title: str = ""
    cover: str = ""
    provider: str = ""

@router.get("")
def list_watchlist(user: User = Depends(require_current_user), db: Session = Depends(get_db)):
    items = db.query(WatchlistItem).filter(WatchlistItem.user_id == user.id).order_by(
        WatchlistItem.created_at.desc()
    ).all()
    return {
        "items": [
            {
                "drama_id": i.drama_id,
                "title": i.title,
                "cover": i.cover,
                "provider": i.provider,
                "created_at": i.created_at,
            }
            for i in items
        ]
    }

@router.post("")
def add_to_watchlist(
    req: AddWatchlistRequest,
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db)
):
    existing = db.query(WatchlistItem).filter(
        WatchlistItem.user_id == user.id,
        WatchlistItem.drama_id == req.drama_id
    ).first()
    if existing:
        return {"status": "already_in_watchlist", "drama_id": req.drama_id}

    item = WatchlistItem(
        user_id=user.id,
        drama_id=req.drama_id,
        title=req.title,
        cover=req.cover,
        provider=req.provider,
    )
    db.add(item)
    db.commit()
    return {"status": "added", "drama_id": req.drama_id}

@router.delete("/{drama_id}")
def remove_from_watchlist(
    drama_id: str,
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db)
):
    item = db.query(WatchlistItem).filter(
        WatchlistItem.user_id == user.id,
        WatchlistItem.drama_id == drama_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not in watchlist")
    db.delete(item)
    db.commit()
    return {"status": "removed", "drama_id": drama_id}

@router.get("/continue-watching")
def continue_watching(user: User = Depends(require_current_user), db: Session = Depends(get_db)):
    rows = db.query(WatchProgress).filter(WatchProgress.user_id == user.id).order_by(
        WatchProgress.updated_at.desc()
    ).limit(10).all()
    return {
        "items": [
            {
                "drama_id": r.drama_id,
                "episode_num": r.episode_num,
                "progress_pct": r.progress_pct,
                "updated_at": r.updated_at,
            }
            for r in rows
        ]
    }
