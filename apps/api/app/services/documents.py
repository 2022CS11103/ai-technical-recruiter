"""Document text extraction with OCR fallback hook."""
from __future__ import annotations

import io
from pathlib import Path


ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}
ALLOWED_MIME = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
    "application/octet-stream",
}


def validate_upload(filename: str, mime_type: str, size_bytes: int, max_mb: int) -> None:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {ext}")
    if mime_type and mime_type not in ALLOWED_MIME:
        # allow octet-stream if extension ok
        if mime_type != "application/octet-stream":
            raise ValueError(f"Unsupported MIME type: {mime_type}")
    if size_bytes > max_mb * 1024 * 1024:
        raise ValueError(f"File exceeds {max_mb}MB limit")


async def extract_text(filename: str, data: bytes) -> str:
    ext = Path(filename).suffix.lower()
    if ext in {".txt", ".md"}:
        return data.decode("utf-8", errors="ignore")
    if ext == ".docx":
        return _extract_docx(data)
    if ext == ".pdf":
        text = _extract_pdf(data)
        if text.strip():
            return text
        return await _ocr_fallback(data)
    raise ValueError("Unsupported file type")


def _extract_pdf(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    parts = []
    for page in reader.pages:
        parts.append(page.extract_text() or "")
    return "\n".join(parts)


def _extract_docx(data: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(data))
    return "\n".join(p.text for p in doc.paragraphs)


async def _ocr_fallback(data: bytes) -> str:
    """Best-effort OCR. If unavailable, return empty with marker."""
    try:
        from PIL import Image
        # Without poppler/tesseract in all envs, we mark for recruiter review.
        _ = Image
        return "[OCR_REQUIRED] No selectable text found in PDF. Install OCR stack or paste text manually."
    except Exception:
        return "[OCR_REQUIRED] No selectable text found in PDF. Paste text manually."
