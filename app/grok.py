"""Thin wrapper around xAI's OpenAI-compatible Responses API."""
import json, re, time
from openai import OpenAI
from . import config

_client = None


class GrokError(RuntimeError):
    pass


def client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=config.XAI_API_KEY, base_url="https://api.x.ai/v1",
                         timeout=config.REQUEST_TIMEOUT)
    return _client


def _citations(resp) -> list[str]:
    """Collect every URL Grok's server-side tools cited, wherever the SDK put it."""
    urls = set()
    extra = getattr(resp, "model_extra", None) or {}
    for c in extra.get("citations", []) or []:
        urls.add(c if isinstance(c, str) else c.get("url", ""))
    for item in getattr(resp, "output", []) or []:
        for part in getattr(item, "content", None) or []:
            for ann in getattr(part, "annotations", None) or []:
                u = getattr(ann, "url", None) or (ann.get("url") if isinstance(ann, dict) else None)
                if u:
                    urls.add(u)
    return sorted(u for u in urls if u)


def call(prompt: str, tools: list | None = None, model: str | None = None, retries: int = 2):
    """Returns (text, cited_urls). Retries transient failures with backoff."""
    last = None
    for attempt in range(retries + 1):
        try:
            kwargs = {"model": model or config.GROK_MODEL,
                      "input": [{"role": "user", "content": prompt}]}
            if tools:
                kwargs["tools"] = tools
            resp = client().responses.create(**kwargs)
            return resp.output_text, _citations(resp)
        except Exception as e:  # network, rate limit, 5xx
            last = e
            time.sleep(2 * (attempt + 1))
    raise GrokError(f"Grok request failed: {last}")


def parse_json(text: str) -> dict:
    text = re.sub(r"```(?:json)?", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in response")
    return json.loads(text[start:end + 1])


def call_json(prompt: str, tools: list | None = None, model: str | None = None):
    """Like call(), but guarantees a dict. One repair pass if Grok returns malformed JSON."""
    text, cites = call(prompt, tools=tools, model=model)
    try:
        return parse_json(text), cites
    except (ValueError, json.JSONDecodeError):
        fixed, _ = call("Convert this into valid JSON only. No prose, no code fences.\n\n" + text,
                        model=config.GROK_FAST_MODEL)
        return parse_json(fixed), cites
