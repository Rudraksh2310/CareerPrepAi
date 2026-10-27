from app.core import rag


def setup_function(_):
    rag.reset_index()


def test_company_alias_matching():
    assert rag.match_company("Amazon Pvt Ltd") == "Amazon"
    assert rag.match_company("tata consultancy services") == "TCS"
    assert rag.match_company("Facebook") == "Meta"
    assert rag.match_company("Some Unknown Startup") is None
    assert rag.match_company(None) is None


def test_role_category():
    assert rag.infer_role_category("Frontend Developer") == "frontend"
    assert rag.infer_role_category("Data Scientist") == "data"
    assert rag.infer_role_category("Software Engineer") == "backend"
    assert rag.infer_role_category("Chef") == "general"


def test_corpus_has_expected_scope():
    corpus = rag.load_corpus()
    companies = {f.company for f in corpus} - {"_generic"}
    assert 10 <= len(companies) <= 15  # Plan Phase 2: 10-15 companies
    assert len({f.id for f in corpus}) == len(corpus)


def test_retrieval_is_company_specific_and_query_sensitive():
    res = rag.retrieve_context("Software Engineer", "Amazon", "I took ownership of a failing deployment pipeline", k=4)
    assert res.company_matched == "Amazon"
    assert res.backend == "tfidf"
    assert any(i["company"] == "Amazon" and i["topic"] == "ownership" for i in res.items)

    res2 = rag.retrieve_context("Software Engineer", "Flipkart", "inventory locking during a flash sale", k=4)
    top = res2.items[0]
    assert top["company"] == "Flipkart"
    assert "sale" in top["question"].lower() or "oversell" in top["question"].lower()


def test_unknown_company_falls_back_to_generic():
    res = rag.retrieve_context("Frontend Developer", "Tiny Startup", "react re-render performance", k=3)
    assert res.company_matched is None
    assert res.items and all(i["company"] == "_generic" for i in res.items)
    assert any("react" in i["question"].lower() for i in res.items)


def test_wrong_specialty_is_demoted():
    res = rag.retrieve_context("Frontend Developer", None, "", k=4)
    assert all("sql" not in i["question"].lower() for i in res.items[:2])


def test_prompt_block_numbering():
    res = rag.retrieve_context("Software Engineer", "Google", "system design", k=2)
    block = res.prompt_block()
    assert block.startswith("[1]") and "[2]" in block
