from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.file_parsing import extract_raw_text
from app.core.extraction import extract_profile
from app.models.models import User, Resume
from app.schemas.schemas import ResumeOut

router = APIRouter(prefix="/resume", tags=["resume"])

ALLOWED_EXTENSIONS = (".pdf", ".docx", ".txt")


@router.post("/upload", response_model=ResumeOut)
async def upload_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename.lower().endswith(ALLOWED_EXTENSIONS):
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, or TXT files are supported.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    raw_text = extract_raw_text(file.filename, file_bytes)
    if not raw_text:
        raise HTTPException(status_code=400, detail="Could not read any text from the file.")

    try:
        extracted = extract_profile(raw_text)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=f"Resume extraction failed: {e}")

    resume = Resume(
        user_id=current_user.id,
        file_name=file.filename,
        parsed_data=extracted.model_dump(),
    )
    db.add(resume)
    db.commit()
    db.refresh(resume)

    return ResumeOut(
        id=resume.id,
        parsed_skills=extracted.key_skills,
        parsed_projects=extracted.notable_projects,
    )
