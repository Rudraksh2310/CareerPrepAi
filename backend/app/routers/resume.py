import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.core import rate_limit
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.extraction import extract_profile
from app.core.file_parsing import extract_raw_text
from app.core.upload_guard import UploadError, validate_resume
from app.models.models import Resume, User
from app.schemas.schemas import ResumeOut

log = logging.getLogger("resume")
router = APIRouter(prefix="/resume", tags=["resume"])


@router.post("/upload", response_model=ResumeOut, dependencies=[Depends(rate_limit.by_user("resume-upload", 10, 600))])
async def upload_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Read at most limit+1 bytes: an oversized body is rejected without loading all of it into memory.
    limit = settings.max_upload_bytes
    file_bytes = await file.read(limit + 1)
    try:
        name, _kind = validate_resume(file.filename, file_bytes, limit)
    except UploadError as e:
        raise HTTPException(status_code=e.status, detail=e.detail)

    try:
        raw_text = await run_in_threadpool(extract_raw_text, name, file_bytes)
    except Exception as e:  # corrupt or hostile document: log the detail, tell the user only what they can act on
        log.warning("could not parse upload %r: %s", name, e)
        raise HTTPException(status_code=400, detail="Could not read this file. Check that it is a valid, text-based PDF, DOCX or TXT.")
    if not raw_text:
        raise HTTPException(status_code=400, detail="Could not read any text from the file. Scanned/image-only PDFs are not supported.")

    try:
        extracted = await run_in_threadpool(extract_profile, raw_text)
    except ValueError as e:
        log.warning("resume extraction failed: %s", e)
        raise HTTPException(status_code=502, detail="Resume extraction failed. Please try again.")

    resume = Resume(
        user_id=current_user.id,
        file_name=name,
        parsed_data=extracted.model_dump(),
    )
    db.add(resume)
    db.commit()
    db.refresh(resume)

    return ResumeOut(
        id=resume.id,
        parsed_skills=extracted.key_skills,
        parsed_projects=extracted.notable_projects,
        parsed_experience=[e.label for e in extracted.experience],
    )
