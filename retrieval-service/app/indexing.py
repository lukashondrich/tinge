import json
from pathlib import Path
from typing import Dict, Iterable, List


def _chunk_text(text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
    normalized = " ".join(text.split())
    if not normalized:
        return []

    chunks: List[str] = []
    start = 0
    step = max(1, chunk_size - chunk_overlap)
    text_len = len(normalized)
    while start < text_len:
        end = min(text_len, start + chunk_size)
        chunks.append(normalized[start:end])
        if end >= text_len:
            break
        start += step
    return chunks


def load_corpus_records(path: str) -> List[Dict]:
    corpus_path = Path(path)
    if not corpus_path.exists():
        raise FileNotFoundError(f"Corpus file not found: {path}")

    records: List[Dict] = []
    with corpus_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            records.append(json.loads(line))
    return records


def build_chunk_records(records: Iterable[Dict], chunk_size: int, chunk_overlap: int) -> List[Dict]:
    chunk_records: List[Dict] = []
    for rec in records:
        content = rec.get("content", "")
        chunks = _chunk_text(content, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        for idx, chunk in enumerate(chunks):
            chunk_records.append(
                {
                    "chunk_id": f"{rec['id']}::chunk::{idx}",
                    "doc_id": rec["id"],
                    "chunk_index": idx,
                    "content": chunk,
                    "title": rec.get("title", ""),
                    "url": rec.get("url", ""),
                    "source": rec.get("source", ""),
                    "language": rec.get("language", "en"),
                    "published_at": rec.get("published_at"),
                }
            )
    return chunk_records

