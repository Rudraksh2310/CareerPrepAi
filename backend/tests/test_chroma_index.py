"""Exercises the ChromaDB code path with a deterministic fake embedding function, so the
collection / filter / rebuild logic is verified without downloading the real model."""
import hashlib

import pytest

chromadb = pytest.importorskip("chromadb")

from app.core import rag


from chromadb.api.types import EmbeddingFunction


class HashEmbedding(EmbeddingFunction):
    """Bag-of-words hashed into 256 dims — deterministic and semantic enough for ranking tests."""

    def __init__(self):
        pass

    @staticmethod
    def name():
        return "hash-embedding"

    def get_config(self):
        return {}

    @staticmethod
    def build_from_config(config):
        return HashEmbedding()

    def __call__(self, input):
        out = []
        for text in input:
            v = [0.0] * 256
            for tok in rag._tokens(text):
                v[int(hashlib.md5(tok.encode()).hexdigest(), 16) % 256] += 1.0
            norm = sum(x * x for x in v) ** 0.5 or 1.0
            out.append([x / norm for x in v])
        return out


def test_chroma_index_company_filter_and_rebuild(tmp_path):
    corpus = rag.load_corpus()
    idx = rag.ChromaIndex(corpus, str(tmp_path), embedding_function=HashEmbedding())
    hits = idx.search("flash sale inventory overselling last item", {"Flipkart"}, 3)
    assert hits and all(f.company == "Flipkart" for f, _ in hits)
    assert "oversell" in hits[0][0].question.lower() or "sale" in hits[0][0].question.lower()

    both = idx.search("react re-render performance", {"Meta", rag.GENERIC}, 4)
    assert {f.company for f, _ in both} <= {"Meta", rag.GENERIC}

    # reopening with identical corpus reuses the persisted collection; changed corpus rebuilds it
    idx2 = rag.ChromaIndex(corpus, str(tmp_path), embedding_function=HashEmbedding())
    assert idx2.col.count() == len(corpus)
    idx3 = rag.ChromaIndex(corpus[:-3], str(tmp_path), embedding_function=HashEmbedding())
    assert idx3.col.count() == len(corpus) - 3
