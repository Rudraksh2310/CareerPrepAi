"""
Authoritative validation of uploaded resumes. The browser's Content-Type and the file extension are only
hints (both are attacker-controlled), so the bytes are checked here: size, magic numbers, structure.
"""

from __future__ import annotations

import io
import re
import zipfile

ALLOWED = {".pdf", ".docx", ".txt"}
MAX_PDF_PAGES = 30
MAX_ZIP_ENTRIES = 2000
MAX_ZIP_UNCOMPRESSED = 25 * 1024 * 1024  # zip-bomb guard for .docx


class UploadError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def safe_filename(name: str | None) -> str:
    """Basename only, no control characters, bounded length: it is stored and shown back to the user."""
    base = (name or "resume").replace("\\", "/").split("/")[-1]
    base = re.sub(r"[\x00-\x1f\x7f]", "", base).strip().strip(".") or "resume"
    return base[:120]


def extension(name: str) -> str:
    n = name.lower()
    return next((e for e in ALLOWED if n.endswith(e)), "")


def detect_kind(content: bytes) -> str | None:
    """Return 'pdf' | 'docx' | 'txt' from the bytes themselves, or None when it is something else."""
    if content[:4] == b"PK\x03\x04":  # zip container: only a real .docx is accepted
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                infos = z.infolist()
                names = {i.filename for i in infos}
                if len(infos) > MAX_ZIP_ENTRIES or sum(i.file_size for i in infos) > MAX_ZIP_UNCOMPRESSED:
                    return None
                if "[Content_Types].xml" in names and "word/document.xml" in names:
                    return "docx"
        except zipfile.BadZipFile:
            return None
        return None
    if b"%PDF-" in content[:1024]:
        return "pdf"
    if b"\x00" in content[:8192]:
        return None  # binary of some other kind
    try:
        content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return None
    return "txt"


def validate_resume(filename: str | None, content: bytes, max_bytes: int) -> tuple[str, str]:
    """Return (safe_name, kind) or raise UploadError with the HTTP status to answer with."""
    name = safe_filename(filename)
    ext = extension(name)
    if not ext:
        raise UploadError(400, "Only PDF, DOCX or TXT files are supported.")
    if not content:
        raise UploadError(400, "Uploaded file is empty.")
    if len(content) > max_bytes:
        raise UploadError(413, f"File is too large. The limit is {max_bytes // (1024 * 1024)} MB.")
    kind = detect_kind(content)
    if kind is None or f".{kind}" != ext:
        raise UploadError(415, "The file's contents do not match its type. Upload a real PDF, DOCX or UTF-8 TXT file.")
    return name, kind
