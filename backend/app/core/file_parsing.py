"""
Raw file -> raw text. Kept separate so the extraction agent always works
with plain text and never has to know or care whether the upload was a
PDF, DOCX, or a plain text JD paste.
"""

import io
import fitz  # PyMuPDF
from docx import Document


MAX_PDF_PAGES = 30


def extract_raw_text(filename: str, file_bytes: bytes) -> str:
    lower = filename.lower()

    if lower.endswith(".pdf"):
        text_parts = []
        with fitz.open(stream=file_bytes, filetype="pdf") as pdf:
            if pdf.page_count > MAX_PDF_PAGES:
                raise ValueError(f"PDF has more than {MAX_PDF_PAGES} pages.")
            for page in pdf:
                text_parts.append(page.get_text())
        return "\n".join(text_parts).strip()

    if lower.endswith(".docx"):
        doc = Document(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs).strip()

    # Fallback: treat as plain text (.txt, or pasted JD content)
    return file_bytes.decode("utf-8-sig", errors="ignore").strip()
