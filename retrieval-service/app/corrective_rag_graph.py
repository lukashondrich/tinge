from __future__ import annotations

import json
import os
from time import perf_counter
from typing import Any, Callable, Dict, List, Literal, Optional, Sequence, TypedDict
from urllib import error as urlerror
from urllib import request as urlrequest

from .logger import get_logger

try:  # pragma: no cover - optional dependency at runtime
    from langgraph.graph import StateGraph

    LANGGRAPH_AVAILABLE = True
except Exception:  # pragma: no cover - optional dependency at runtime
    StateGraph = None
    LANGGRAPH_AVAILABLE = False


RelevanceLabel = Literal["high", "medium", "low", "none"]

_VALID_RELEVANCE_LABELS = {"high", "medium", "low", "none"}
_DEFAULT_OPENAI_URL = "https://api.openai.com/v1/chat/completions"
_DEFAULT_DIALOGUE_TURNS = 3


class CorrectiveRagState(TypedDict, total=False):
    query_original: str
    query_en: str
    current_query_en: str
    language: str
    top_k: int
    dialogue_context: List[str]

    attempt: int
    max_attempts: int
    deadline_monotonic: float

    retrieval_results: List[Dict[str, Any]]
    first_pass_results: List[Dict[str, Any]]
    used_queries: List[str]
    index_name: str

    relevance_label: RelevanceLabel
    relevance_score: float
    relevance_reason: str
    relevance_history: List[str]
    relevance_model: str

    rewritten_query_en: str
    rewrite_reason: str
    rewrite_history: List[str]

    final_results: List[Dict[str, Any]]
    status: str
    fallback_reason: str
    timings_ms: Dict[str, float]


def normalize_dialogue_context(
    dialogue_context: Optional[Sequence[str]],
    max_turns: int = _DEFAULT_DIALOGUE_TURNS,
) -> List[str]:
    if not dialogue_context:
        return []

    cleaned = [
        str(entry).strip()
        for entry in dialogue_context
        if isinstance(entry, str) and entry.strip()
    ]
    return cleaned[-max(1, max_turns) :]


def _tokenize(value: str) -> List[str]:
    text = "".join(ch.lower() if ch.isalnum() else " " for ch in (value or ""))
    return [token for token in text.split() if len(token) > 2]


def heuristic_grade_relevance(
    *,
    query_original: str,
    query_en: str,
    dialogue_context: Sequence[str],
    retrieval_results: Sequence[Dict[str, Any]],
) -> Dict[str, Any]:
    if not retrieval_results:
        return {
            "label": "none",
            "score": 0.0,
            "reason": "No retrieval results available.",
            "model": "heuristic"
        }

    first = retrieval_results[0] or {}
    top_score = float(first.get("score") or 0.0)
    context_text = " ".join(dialogue_context)
    query_tokens = set(_tokenize(" ".join([query_original, query_en, context_text])))
    snippet_tokens = set(_tokenize(" ".join(str(item.get("snippet", "")) for item in retrieval_results[:3])))

    overlap = 0.0
    if query_tokens:
        overlap = len(query_tokens.intersection(snippet_tokens)) / len(query_tokens)

    score = min(1.0, max(0.0, (top_score / 2.0) * 0.6 + overlap * 0.4))
    if score >= 0.75:
        label = "high"
    elif score >= 0.55:
        label = "medium"
    elif score >= 0.25:
        label = "low"
    else:
        label = "none"

    return {
        "label": label,
        "score": round(score, 3),
        "reason": f"Heuristic grade based on score overlap (top_score={top_score:.3f}, overlap={overlap:.3f}).",
        "model": "heuristic"
    }


def heuristic_rewrite_query(*, query_en: str, dialogue_context: Sequence[str]) -> Dict[str, str]:
    context_tokens: List[str] = []
    if dialogue_context:
        context_tokens = _tokenize(dialogue_context[-1])[:5]

    if context_tokens:
        rewritten = f"{query_en.strip()} {' '.join(context_tokens)}".strip()
    else:
        rewritten = query_en.strip()

    return {
        "query_en": rewritten or query_en,
        "reason": "Heuristic rewrite using latest dialogue context keywords."
    }


class OpenAICorrectiveClient:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        timeout_ms: int = 900,
        logger=None,
        endpoint: str = _DEFAULT_OPENAI_URL,
        now_fn: Callable[[], float] = perf_counter,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout_ms = max(150, int(timeout_ms))
        self.endpoint = endpoint
        self.logger = logger or get_logger("retrieval-corrective-llm")
        self.now_fn = now_fn

    def _remaining_timeout_seconds(self, deadline_monotonic: float) -> float:
        remaining = deadline_monotonic - self.now_fn()
        if remaining <= 0:
            raise TimeoutError("Corrective RAG time budget exhausted")
        capped = min(self.timeout_ms / 1000.0, max(0.15, remaining - 0.05))
        if capped <= 0:
            raise TimeoutError("No remaining timeout budget for LLM call")
        return capped

    def _invoke_json(self, messages: List[Dict[str, str]], deadline_monotonic: float) -> Dict[str, Any]:
        timeout_seconds = self._remaining_timeout_seconds(deadline_monotonic)
        payload = {
            "model": self.model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": messages,
        }
        data = json.dumps(payload).encode("utf-8")
        req = urlrequest.Request(
            self.endpoint,
            data=data,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urlrequest.urlopen(req, timeout=timeout_seconds) as response:
                body = response.read().decode("utf-8")
        except urlerror.HTTPError as err:
            detail = err.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"OpenAI HTTP {err.code}: {detail}") from err
        except urlerror.URLError as err:
            raise RuntimeError(f"OpenAI network error: {err}") from err

        decoded = json.loads(body)
        content = decoded.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("OpenAI response missing JSON content")
        return json.loads(content)

    def grade_relevance(
        self,
        *,
        query_original: str,
        query_en: str,
        dialogue_context: Sequence[str],
        retrieval_results: Sequence[Dict[str, Any]],
        deadline_monotonic: float,
    ) -> Dict[str, Any]:
        snippets = []
        for item in retrieval_results[:3]:
            snippets.append(
                {
                    "title": str(item.get("title", "")),
                    "url": str(item.get("url", "")),
                    "score": float(item.get("score", 0.0) or 0.0),
                    "snippet": str(item.get("snippet", ""))[:280],
                }
            )

        content = self._invoke_json(
            [
                {
                    "role": "system",
                    "content": (
                        "You grade retrieval relevance for citation quality. "
                        "Return JSON with keys: label, score, reason. "
                        "label must be one of high, medium, low, none. "
                        "score must be a number between 0 and 1."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "query_original": query_original,
                            "query_en": query_en,
                            "dialogue_context": list(dialogue_context),
                            "top_results": snippets,
                        }
                    ),
                },
            ],
            deadline_monotonic=deadline_monotonic,
        )

        label = str(content.get("label", "")).strip().lower()
        if label not in _VALID_RELEVANCE_LABELS:
            label = "low"
        score = float(content.get("score", 0.4) or 0.4)
        score = max(0.0, min(1.0, score))
        return {
            "label": label,
            "score": score,
            "reason": str(content.get("reason", "LLM relevance grade."))[:320],
            "model": self.model,
        }

    def rewrite_query(
        self,
        *,
        query_original: str,
        query_en: str,
        dialogue_context: Sequence[str],
        retrieval_results: Sequence[Dict[str, Any]],
        deadline_monotonic: float,
    ) -> Dict[str, str]:
        content = self._invoke_json(
            [
                {
                    "role": "system",
                    "content": (
                        "Rewrite the English retrieval query to improve citation relevance. "
                        "Return JSON with keys: query_en, reason. "
                        "Keep it short, specific, and retrieval-friendly."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "query_original": query_original,
                            "query_en": query_en,
                            "dialogue_context": list(dialogue_context),
                            "top_result_titles": [str(item.get("title", "")) for item in retrieval_results[:3]],
                            "top_result_snippets": [str(item.get("snippet", ""))[:180] for item in retrieval_results[:2]],
                        }
                    ),
                },
            ],
            deadline_monotonic=deadline_monotonic,
        )
        rewritten = str(content.get("query_en", "")).strip()
        if not rewritten:
            rewritten = query_en
        return {
            "query_en": rewritten,
            "reason": str(content.get("reason", "LLM rewrite."))[:320],
        }


class CorrectiveRagWorkflow:
    def __init__(
        self,
        *,
        retrieve_fn: Callable[..., Dict[str, Any]],
        llm_client: Optional[OpenAICorrectiveClient] = None,
        grade_fn: Optional[Callable[..., Dict[str, Any]]] = None,
        rewrite_fn: Optional[Callable[..., Dict[str, str]]] = None,
        max_attempts: int = 2,
        budget_ms: int = 3000,
        dialogue_turns: int = _DEFAULT_DIALOGUE_TURNS,
        now_fn: Callable[[], float] = perf_counter,
        logger=None,
        use_langgraph: bool = True,
    ) -> None:
        self.retrieve_fn = retrieve_fn
        self.llm_client = llm_client
        self.grade_fn = grade_fn
        self.rewrite_fn = rewrite_fn
        self.max_attempts = max(0, int(max_attempts))
        self.budget_ms = max(500, int(budget_ms))
        self.dialogue_turns = max(1, int(dialogue_turns))
        self.now_fn = now_fn
        self.logger = logger or get_logger("retrieval-corrective-rag")
        self.graph = self._build_graph() if use_langgraph else None

    def _build_graph(self):  # pragma: no cover - depends on optional dependency
        if not LANGGRAPH_AVAILABLE or StateGraph is None:
            return None
        try:
            graph = StateGraph(dict)
            graph.add_node("retrieve", self._node_retrieve)
            graph.add_node("grade", self._node_grade)
            graph.add_node("rewrite", self._node_rewrite)
            graph.add_node("finalize", self._node_finalize)
            graph.set_entry_point("retrieve")
            graph.add_edge("retrieve", "grade")
            graph.add_conditional_edges(
                "grade",
                self._route_after_grade,
                {"rewrite": "rewrite", "finalize": "finalize"},
            )
            graph.add_edge("rewrite", "retrieve")
            graph.set_finish_point("finalize")
            return graph.compile()
        except Exception as err:
            self.logger.warning(f"[corrective-rag] LangGraph unavailable, using manual loop ({err})")
            return None

    def _remaining_budget_ms(self, state: CorrectiveRagState) -> int:
        deadline = float(state.get("deadline_monotonic", self.now_fn()))
        remaining = int((deadline - self.now_fn()) * 1000)
        return max(0, remaining)

    def _merge_used_queries(self, current: Sequence[str], incoming: Sequence[str]) -> List[str]:
        merged = list(current)
        for query in incoming:
            q = str(query).strip()
            if q and q not in merged:
                merged.append(q)
        return merged

    def _node_retrieve(self, state: CorrectiveRagState) -> Dict[str, Any]:
        started = self.now_fn()
        current_query_en = str(state.get("current_query_en") or state.get("query_en") or "").strip()
        result = self.retrieve_fn(
            query_original=state["query_original"],
            query_en=current_query_en,
            language=state.get("language"),
            top_k=state.get("top_k"),
        )
        results = list(result.get("results", []))
        used_queries = self._merge_used_queries(
            state.get("used_queries", []),
            result.get("used_queries", []),
        )
        elapsed_ms = (self.now_fn() - started) * 1000.0

        updates: Dict[str, Any] = {
            "retrieval_results": results,
            "used_queries": used_queries,
            "index_name": str(result.get("index_name", state.get("index_name", ""))),
            "timings_ms": {
                **state.get("timings_ms", {}),
                "retrieval_total": state.get("timings_ms", {}).get("retrieval_total", 0.0) + elapsed_ms,
            },
        }
        if "first_pass_results" not in state:
            updates["first_pass_results"] = results
        return updates

    def _node_grade(self, state: CorrectiveRagState) -> Dict[str, Any]:
        started = self.now_fn()
        grade: Dict[str, Any]
        if self.grade_fn is not None:
            grade = self.grade_fn(
                query_original=state["query_original"],
                query_en=state.get("current_query_en", state.get("query_en", "")),
                dialogue_context=state.get("dialogue_context", []),
                retrieval_results=state.get("retrieval_results", []),
            )
        elif self.llm_client is not None and self._remaining_budget_ms(state) > 200:
            try:
                grade = self.llm_client.grade_relevance(
                    query_original=state["query_original"],
                    query_en=state.get("current_query_en", state.get("query_en", "")),
                    dialogue_context=state.get("dialogue_context", []),
                    retrieval_results=state.get("retrieval_results", []),
                    deadline_monotonic=float(state["deadline_monotonic"]),
                )
            except Exception as err:
                self.logger.warning(f"[corrective-rag] LLM grade failed, using heuristic ({err})")
                grade = heuristic_grade_relevance(
                    query_original=state["query_original"],
                    query_en=state.get("current_query_en", state.get("query_en", "")),
                    dialogue_context=state.get("dialogue_context", []),
                    retrieval_results=state.get("retrieval_results", []),
                )
        else:
            grade = heuristic_grade_relevance(
                query_original=state["query_original"],
                query_en=state.get("current_query_en", state.get("query_en", "")),
                dialogue_context=state.get("dialogue_context", []),
                retrieval_results=state.get("retrieval_results", []),
            )

        label = str(grade.get("label", "low")).strip().lower()
        if label not in _VALID_RELEVANCE_LABELS:
            label = "low"
        score = max(0.0, min(1.0, float(grade.get("score", 0.4) or 0.4)))
        reason = str(grade.get("reason", "Relevance graded."))[:320]
        model = str(grade.get("model", "heuristic"))
        elapsed_ms = (self.now_fn() - started) * 1000.0

        history = list(state.get("relevance_history", []))
        history.append(label)
        return {
            "relevance_label": label,
            "relevance_score": score,
            "relevance_reason": reason,
            "relevance_model": model,
            "relevance_history": history,
            "timings_ms": {
                **state.get("timings_ms", {}),
                "grade_total": state.get("timings_ms", {}).get("grade_total", 0.0) + elapsed_ms,
            },
        }

    def _route_after_grade(self, state: CorrectiveRagState) -> str:
        label = str(state.get("relevance_label", "none"))
        attempts = int(state.get("attempt", 0))
        if label in {"high", "medium"}:
            return "finalize"
        if attempts < int(state.get("max_attempts", self.max_attempts)) and self._remaining_budget_ms(state) > 200:
            return "rewrite"
        return "finalize"

    def _node_rewrite(self, state: CorrectiveRagState) -> Dict[str, Any]:
        started = self.now_fn()
        current_query = str(state.get("current_query_en", state.get("query_en", ""))).strip()
        rewritten: Dict[str, str]

        if self.rewrite_fn is not None:
            rewritten = self.rewrite_fn(
                query_original=state["query_original"],
                query_en=current_query,
                dialogue_context=state.get("dialogue_context", []),
                retrieval_results=state.get("retrieval_results", []),
            )
        elif self.llm_client is not None and self._remaining_budget_ms(state) > 200:
            try:
                rewritten = self.llm_client.rewrite_query(
                    query_original=state["query_original"],
                    query_en=current_query,
                    dialogue_context=state.get("dialogue_context", []),
                    retrieval_results=state.get("retrieval_results", []),
                    deadline_monotonic=float(state["deadline_monotonic"]),
                )
            except Exception as err:
                self.logger.warning(f"[corrective-rag] LLM rewrite failed, using heuristic ({err})")
                rewritten = heuristic_rewrite_query(
                    query_en=current_query,
                    dialogue_context=state.get("dialogue_context", []),
                )
        else:
            rewritten = heuristic_rewrite_query(
                query_en=current_query,
                dialogue_context=state.get("dialogue_context", []),
            )

        rewritten_query = str(rewritten.get("query_en", "")).strip() or current_query
        rewrite_reason = str(rewritten.get("reason", "Rewrite attempt."))[:320]
        elapsed_ms = (self.now_fn() - started) * 1000.0

        rewrite_history = list(state.get("rewrite_history", []))
        rewrite_history.append(rewritten_query)
        return {
            "current_query_en": rewritten_query,
            "rewritten_query_en": rewritten_query,
            "rewrite_reason": rewrite_reason,
            "attempt": int(state.get("attempt", 0)) + 1,
            "rewrite_history": rewrite_history,
            "timings_ms": {
                **state.get("timings_ms", {}),
                "rewrite_total": state.get("timings_ms", {}).get("rewrite_total", 0.0) + elapsed_ms,
            },
        }

    def _node_finalize(self, state: CorrectiveRagState) -> Dict[str, Any]:
        label = str(state.get("relevance_label", "none"))
        latest = list(state.get("retrieval_results", []))
        first_pass = list(state.get("first_pass_results", latest))
        fallback_reason = ""

        if label in {"high", "medium"} and latest:
            final_results = latest
            status = "ok"
        elif first_pass:
            final_results = first_pass
            status = "fallback"
            fallback_reason = "Relevance stayed low after corrective attempts; returning first-pass results."
        else:
            final_results = latest
            status = "failed"
            fallback_reason = "No retrieval results available."

        meta = {
            "enabled": True,
            "engine": "langgraph" if self.graph is not None else "manual_loop",
            "attempts_used": int(state.get("attempt", 0)),
            "max_attempts": int(state.get("max_attempts", self.max_attempts)),
            "final_label": label,
            "relevance_score": float(state.get("relevance_score", 0.0)),
            "relevance_model": str(state.get("relevance_model", "heuristic")),
            "relevance_history": list(state.get("relevance_history", [])),
            "rewrite_history": list(state.get("rewrite_history", [])),
            "fallback_reason": fallback_reason or None,
            "timings_ms": dict(state.get("timings_ms", {})),
            "budget_remaining_ms": self._remaining_budget_ms(state),
        }
        return {
            "final_results": final_results,
            "status": status,
            "fallback_reason": fallback_reason,
            "meta_corrective_rag": meta,
        }

    def _run_manual(self, state: CorrectiveRagState) -> CorrectiveRagState:
        state = dict(state)
        state.update(self._node_retrieve(state))
        while True:
            state.update(self._node_grade(state))
            if self._route_after_grade(state) != "rewrite":
                state.update(self._node_finalize(state))
                return state
            state.update(self._node_rewrite(state))
            state.update(self._node_retrieve(state))

    def run(
        self,
        *,
        query_original: str,
        query_en: str,
        language: Optional[str],
        top_k: Optional[int],
        dialogue_context: Optional[Sequence[str]],
        index_name: str,
    ) -> Dict[str, Any]:
        cleaned_context = normalize_dialogue_context(dialogue_context, max_turns=self.dialogue_turns)
        state: CorrectiveRagState = {
            "query_original": query_original.strip(),
            "query_en": query_en.strip() or query_original.strip(),
            "current_query_en": query_en.strip() or query_original.strip(),
            "language": (language or "en"),
            "top_k": int(top_k) if top_k else 0,
            "dialogue_context": cleaned_context,
            "attempt": 0,
            "max_attempts": self.max_attempts,
            "deadline_monotonic": self.now_fn() + (self.budget_ms / 1000.0),
            "used_queries": [],
            "index_name": index_name,
            "timings_ms": {},
            "relevance_history": [],
            "rewrite_history": [],
        }

        started_total = self.now_fn()
        final_state: CorrectiveRagState
        if self.graph is not None:
            try:
                final_state = self.graph.invoke(state)
            except Exception as err:
                self.logger.warning(f"[corrective-rag] Graph invoke failed; using manual loop ({err})")
                final_state = self._run_manual(state)
        else:
            final_state = self._run_manual(state)

        total_elapsed_ms = (self.now_fn() - started_total) * 1000.0
        timings = dict(final_state.get("timings_ms", {}))
        timings["total"] = total_elapsed_ms

        meta = dict(final_state.get("meta_corrective_rag", {}))
        meta["timings_ms"] = timings

        return {
            "results": list(final_state.get("final_results", [])),
            "used_queries": list(final_state.get("used_queries", [])),
            "index_name": str(final_state.get("index_name", index_name)),
            "meta": {"corrective_rag": meta},
        }


def build_corrective_llm_client_from_env(
    *,
    model: str,
    timeout_ms: int,
    logger=None,
) -> Optional[OpenAICorrectiveClient]:
    api_key = str(os.getenv("OPENAI_API_KEY", "")).strip()
    if not api_key:
        return None
    return OpenAICorrectiveClient(
        api_key=api_key,
        model=model,
        timeout_ms=timeout_ms,
        logger=logger,
    )
