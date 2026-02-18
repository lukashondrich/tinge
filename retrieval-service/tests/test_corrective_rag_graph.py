import unittest

from app.corrective_rag_graph import CorrectiveRagWorkflow


class _NoopLogger:
    def warning(self, *_args, **_kwargs):
        return None

    def info(self, *_args, **_kwargs):
        return None


class _StubLLM:
    model = "stub-llm"

    def grade_relevance(self, *, query_original, query_en, dialogue_context, retrieval_results, deadline_monotonic):
        _ = (query_original, dialogue_context, retrieval_results, deadline_monotonic)
        if "panot" in query_en.lower():
            return {
                "label": "high",
                "score": 0.92,
                "reason": "Contains target topic and relevant snippets.",
                "model": self.model,
            }
        return {
            "label": "low",
            "score": 0.22,
            "reason": "Weak topical match.",
            "model": self.model,
        }

    def rewrite_query(self, *, query_original, query_en, dialogue_context, retrieval_results, deadline_monotonic):
        _ = (query_original, query_en, dialogue_context, retrieval_results, deadline_monotonic)
        return {
            "query_en": "barcelona panot street tile history",
            "reason": "Added specific entity and intent terms.",
        }


class CorrectiveRagWorkflowTests(unittest.TestCase):
    def test_retries_and_improves_relevance(self):
        calls = []

        def retrieve_fn(*, query_original, query_en, language, top_k):
            _ = (query_original, language, top_k)
            calls.append(query_en)
            if "panot" in query_en.lower():
                score = 1.31
                snippet = "Panots are iconic Barcelona pavement tiles."
            else:
                score = 0.12
                snippet = "Generic travel note unrelated to pavement tiles."
            return {
                "results": [
                    {
                        "chunk_id": "c1",
                        "doc_id": "d1",
                        "score": score,
                        "snippet": snippet,
                        "title": "Barcelona urban design",
                        "url": "https://example.org/barcelona",
                        "source": "example",
                        "language": "en",
                        "published_at": None,
                    }
                ],
                "used_queries": [query_original, query_en],
                "index_name": "idx_test",
            }

        workflow = CorrectiveRagWorkflow(
            retrieve_fn=retrieve_fn,
            llm_client=_StubLLM(),
            max_attempts=2,
            budget_ms=3000,
            logger=_NoopLogger(),
            use_langgraph=False,
        )
        result = workflow.run(
            query_original="tell me about barcelona street tiles",
            query_en="barcelona street tiles",
            language="en",
            top_k=3,
            dialogue_context=["user: curious about panot history in Barcelona"],
            index_name="idx_test",
        )

        self.assertEqual(len(calls), 2)
        self.assertIn("panot", calls[-1].lower())
        self.assertEqual(result["meta"]["corrective_rag"]["final_label"], "high")
        self.assertEqual(result["meta"]["corrective_rag"]["attempts_used"], 1)
        self.assertGreater(result["results"][0]["score"], 1.0)

    def test_falls_back_to_first_pass_when_relevance_stays_low(self):
        calls = []

        def retrieve_fn(*, query_original, query_en, language, top_k):
            _ = (query_original, language, top_k)
            calls.append(query_en)
            return {
                "results": [
                    {
                        "chunk_id": f"c{len(calls)}",
                        "doc_id": f"d{len(calls)}",
                        "score": 0.11,
                        "snippet": f"weak snippet {len(calls)}",
                        "title": "Weak result",
                        "url": f"https://example.org/weak/{len(calls)}",
                        "source": "example",
                        "language": "en",
                        "published_at": None,
                    }
                ],
                "used_queries": [query_original, query_en],
                "index_name": "idx_test",
            }

        class AlwaysLowLLM(_StubLLM):
            def grade_relevance(self, *, query_original, query_en, dialogue_context, retrieval_results, deadline_monotonic):
                _ = (query_original, query_en, dialogue_context, retrieval_results, deadline_monotonic)
                return {
                    "label": "low",
                    "score": 0.1,
                    "reason": "Still weak",
                    "model": self.model,
                }

            def rewrite_query(self, *, query_original, query_en, dialogue_context, retrieval_results, deadline_monotonic):
                _ = (query_original, dialogue_context, retrieval_results, deadline_monotonic)
                return {
                    "query_en": f"{query_en} refined",
                    "reason": "Attempted refinement",
                }

        workflow = CorrectiveRagWorkflow(
            retrieve_fn=retrieve_fn,
            llm_client=AlwaysLowLLM(),
            max_attempts=2,
            budget_ms=3000,
            logger=_NoopLogger(),
            use_langgraph=False,
        )
        result = workflow.run(
            query_original="query",
            query_en="query",
            language="en",
            top_k=3,
            dialogue_context=["u: context"],
            index_name="idx_test",
        )

        self.assertEqual(len(calls), 3)  # first pass + 2 retries
        self.assertEqual(result["meta"]["corrective_rag"]["attempts_used"], 2)
        self.assertEqual(result["meta"]["corrective_rag"]["final_label"], "low")
        self.assertIsNotNone(result["meta"]["corrective_rag"]["fallback_reason"])
        self.assertEqual(result["results"][0]["chunk_id"], "c1")


if __name__ == "__main__":
    unittest.main()
