import pytest

import langchain_openai
import llm_provider


@pytest.mark.parametrize(
    ("model", "expected_temperature"),
    [("gpt-6-luna", None), ("gpt-5.6-sol", None), ("o3-mini", None), ("gpt-4o", 0.3)],
)
def test_openai_temperature_compatibility(monkeypatch, model, expected_temperature):
    monkeypatch.setattr(llm_provider, "OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(llm_provider, "OPENAI_MODEL", model)
    monkeypatch.setattr(llm_provider, "_openai_unavailable_since", None)
    monkeypatch.setattr(langchain_openai, "ChatOpenAI", lambda **kwargs: kwargs)

    options = llm_provider.get_llm(temperature=0.3)

    assert options.get("temperature") == expected_temperature
