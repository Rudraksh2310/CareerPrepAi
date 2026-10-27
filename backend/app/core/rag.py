"""
RAG layer — Process 2.0 (Retrieve Company FAQs) from the project plan, Phase 2.

    corpus (app/data/company_faqs.json)
        -> vector index (ChromaDB, embedding similarity)   [preferred]
        -> TF-IDF cosine index (pure Python, no downloads) [automatic fallback]
    retrieve_context(role, company, query_text) -> top-k grounded FAQ snippets

Why two backends: ChromaDB's default embedding model (all-MiniLM-L6-v2) is
downloaded the first time it is used. On a machine without internet/disk
access that fails, and the interview must still work, so any Chroma failure
drops to the local TF-IDF index. Both implement the same `search()` contract,
so nothing upstream cares which one answered.

The retrieval query is built from the role, the company AND the candidate's
latest answer — that is what makes follow-ups "RAG-grounded" rather than just
generic: the retriever pulls the company-specific question patterns / evaluation
criteria that are closest to what the candidate just talked about.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import re
import threading
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from app.core.config import settings

log = logging.getLogger("rag")

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "company_faqs.json"
GENERIC = "_generic"

# canonical company -> aliases people actually type
COMPANY_ALIASES: dict[str, list[str]] = {
    "Amazon": ["amazon", "amazon.com", "aws", "amazon web services"],
    "Google": ["google", "alphabet", "google llc"],
    "Microsoft": ["microsoft", "msft", "microsoft corporation"],
    "Meta": ["meta", "facebook", "instagram", "whatsapp"],
    "Flipkart": ["flipkart"],
    "TCS": ["tcs", "tata consultancy services", "tata consultancy"],
    "Infosys": ["infosys", "infy"],
    "Wipro": ["wipro"],
    "Accenture": ["accenture"],
    "Deloitte": ["deloitte"],
    "Zomato": ["zomato", "eternal"],
    "Adobe": ["adobe"],
}

_STOP = set(
    "a an the and or of to in on for with is are was were be been it this that as at by from "
    "i you your my me we our do does did how what why when would could should can will about "
    "tell give describe explain walk through time work worked working".split()
)


# --------------------------------------------------------------------------- corpus


@dataclass
class FAQ:
    id: str
    company: str
    role_category: str
    type: str
    topic: str
    question: str
    looks_for: str

    @property
    def document(self) -> str:
        return f"{self.company} {self.role_category} {self.type} {self.topic}: {self.question} {self.looks_for}"

    def public(self, score: float) -> dict:
        return {
            "id": self.id,
            "company": self.company,
            "topic": self.topic,
            "question": self.question,
            "looks_for": self.looks_for,
            "score": round(float(score), 3),
        }


def load_corpus(path: Path = DATA_FILE) -> list[FAQ]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    out: list[FAQ] = []
    for i, row in enumerate(raw["faqs"]):
        slug = hashlib.sha1(f"{row['company']}|{row['question']}".encode()).hexdigest()[:10]
        out.append(
            FAQ(
                id=f"faq-{i:03d}-{slug}",
                company=row["company"],
                role_category=row.get("role_category", "general"),
                type=row.get("type", "technical"),
                topic=row.get("topic", ""),
                question=row["question"],
                looks_for=row.get("looks_for", ""),
            )
        )
    return out


def corpus_hash(corpus: list[FAQ]) -> str:
    return hashlib.sha1("".join(f.id + f.document for f in corpus).encode()).hexdigest()


# --------------------------------------------------------------------------- normalisation helpers


def match_company(company: str | None) -> str | None:
    """Map free text ("Amazon Pvt Ltd", "tata consultancy services") to a canonical bank name."""
    if not company:
        return None
    text = re.sub(r"[^a-z0-9. ]", " ", company.lower()).strip()
    for canonical, aliases in COMPANY_ALIASES.items():
        for alias in aliases:
            if text == alias or re.search(rf"\b{re.escape(alias)}\b", text):
                return canonical
    return None


def infer_role_category(role: str | None) -> str:
    r = (role or "").lower()
    if re.search(r"front.?end|ui\b|react|web developer|angular|vue", r):
        return "frontend"
    if re.search(r"back.?end|server|api|java developer|python developer|full.?stack|software|sde|engineer|developer", r):
        return "backend"
    if re.search(r"data|ml\b|machine learning|ai\b|analyst|scientist", r):
        return "data"
    return "general"


def _tokens(text: str) -> list[str]:
    out = []
    for t in re.findall(r"[a-z0-9+#.]+", text.lower()):
        t = t.strip(".")
        if not t or t in _STOP or len(t) < 2:
            continue
        for suf in ("ing", "ed", "es", "s"):
            if len(t) > 4 and t.endswith(suf):
                t = t[: -len(suf)]
                break
        out.append(t)
    return out


# --------------------------------------------------------------------------- local TF-IDF backend


class LocalIndex:
    name = "tfidf"

    def __init__(self, corpus: list[FAQ]):
        self.corpus = corpus
        self.docs = [Counter(_tokens(f.document)) for f in corpus]
        df: Counter = Counter()
        for d in self.docs:
            df.update(d.keys())
        n = len(corpus)
        self.idf = {t: math.log((n + 1) / (c + 0.5)) + 1 for t, c in df.items()}
        self.norms = [self._norm(d) for d in self.docs]

    def _norm(self, counts: Counter) -> float:
        return math.sqrt(sum((c * self.idf.get(t, 1.0)) ** 2 for t, c in counts.items())) or 1.0

    def scores(self, query: str) -> list[float]:
        q = Counter(_tokens(query))
        if not q:
            return [0.0] * len(self.corpus)
        qn = self._norm(q)
        out = []
        for d, dn in zip(self.docs, self.norms):
            dot = sum(c * self.idf.get(t, 1.0) * d.get(t, 0) * self.idf.get(t, 1.0) for t, c in q.items() if t in d)
            out.append(dot / (qn * dn))
        return out

    def search(self, query: str, companies: set[str], k: int) -> list[tuple[FAQ, float]]:
        sc = self.scores(query)
        ranked = [(f, s) for f, s in zip(self.corpus, sc) if f.company in companies]
        ranked.sort(key=lambda x: x[1], reverse=True)
        return ranked[:k]


# --------------------------------------------------------------------------- Chroma backend


class ChromaIndex:
    name = "chroma"

    def __init__(self, corpus: list[FAQ], persist_dir: str, embedding_function=None):
        import chromadb  # imported lazily so the app runs without it installed

        # embedding_function=None -> Chroma's default (all-MiniLM-L6-v2, downloaded on first use).
        ef = {"embedding_function": embedding_function} if embedding_function is not None else {}
        self.by_id = {f.id: f for f in corpus}
        client = chromadb.PersistentClient(path=persist_dir)
        h = corpus_hash(corpus)
        col = client.get_or_create_collection("company_faqs", metadata={"hash": h, "hnsw:space": "cosine"}, **ef)
        if (col.metadata or {}).get("hash") != h or col.count() != len(corpus):
            client.delete_collection("company_faqs")
            col = client.create_collection("company_faqs", metadata={"hash": h, "hnsw:space": "cosine"}, **ef)
            col.add(
                ids=[f.id for f in corpus],
                documents=[f.document for f in corpus],
                metadatas=[{"company": f.company, "role_category": f.role_category} for f in corpus],
            )
        self.col = col
        # Fail now (not mid-interview) if the embedding model cannot run.
        self.col.query(query_texts=["warm up"], n_results=1)

    def search(self, query: str, companies: set[str], k: int) -> list[tuple[FAQ, float]]:
        res = self.col.query(
            query_texts=[query],
            n_results=k,
            where={"company": {"$in": sorted(companies)}} if len(companies) > 1 else {"company": next(iter(companies))},
        )
        out = []
        for fid, dist in zip(res["ids"][0], res["distances"][0]):
            out.append((self.by_id[fid], 1.0 - float(dist)))  # cosine distance -> similarity
        return out


# --------------------------------------------------------------------------- public API

_lock = threading.Lock()
_index = None
_corpus: list[FAQ] | None = None


def get_index():
    global _index, _corpus
    if _index is not None:
        return _index
    with _lock:
        if _index is not None:
            return _index
        _corpus = load_corpus()
        mode = (settings.rag_backend or "auto").lower()
        if mode in ("auto", "chroma"):
            try:
                _index = ChromaIndex(_corpus, settings.rag_persist_dir)
                log.info("RAG: using ChromaDB vector index (%d FAQs)", len(_corpus))
            except Exception as exc:  # noqa: BLE001 — any failure => fallback
                if mode == "chroma":
                    raise
                log.warning("RAG: ChromaDB unavailable (%s) — using local TF-IDF index.", exc)
        if _index is None:
            _index = LocalIndex(_corpus)
            log.info("RAG: using local TF-IDF index (%d FAQs)", len(_corpus))
    return _index


def reset_index() -> None:
    """For tests."""
    global _index, _corpus
    _index, _corpus = None, None


@dataclass
class RetrievalResult:
    items: list[dict] = field(default_factory=list)
    company_matched: str | None = None
    backend: str = ""

    def prompt_block(self) -> str:
        if not self.items:
            return "None available."
        return "\n".join(
            f"[{i + 1}] ({it['company'] if it['company'] != GENERIC else 'general'} / {it['topic']}) "
            f"{it['question']}  — interviewers look for: {it['looks_for']}"
            for i, it in enumerate(self.items)
        )


def retrieve_context(role: str | None, company: str | None, query_text: str = "", k: int = 4) -> RetrievalResult:
    """Top-k grounded FAQ snippets for this role + company + the candidate's latest answer.

    Company-specific items are preferred; generic ones fill the remainder. Never raises:
    retrieval trouble must not break a live interview.
    """
    try:
        index = get_index()
        canon = match_company(company)
        category = infer_role_category(role)
        query = f"{role or ''} {category} {company or ''} {query_text}".strip()

        results: list[tuple[FAQ, float]] = []
        if canon:
            results += index.search(query, {canon}, k)
        results += index.search(query, {GENERIC}, k)

        def adj(item: tuple[FAQ, float]) -> float:
            faq, s = item
            bonus = 0.0
            if faq.company == canon:
                bonus += 0.08
            if faq.role_category == category:
                bonus += 0.04
            elif faq.role_category != "general":
                bonus -= 0.06  # wrong-specialty technical question (e.g. data Q for a frontend role)
            return s + bonus

        results.sort(key=adj, reverse=True)
        seen, items = set(), []
        for faq, s in results:
            if faq.id in seen:
                continue
            seen.add(faq.id)
            items.append(faq.public(adj((faq, s))))
            if len(items) >= k:
                break
        return RetrievalResult(items=items, company_matched=canon, backend=index.name)
    except Exception as exc:  # noqa: BLE001
        log.warning("RAG retrieval failed: %s", exc)
        return RetrievalResult()
