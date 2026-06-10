"""Cliente LLM vía Groq (API compatible con OpenAI): chat con tools, JSON estructurado y visión."""
import asyncio
import json
import logging
import re
from typing import Optional, Type, TypeVar

from openai import AsyncOpenAI
from pydantic import BaseModel

from app.core.config import get_settings

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

MAX_GROQ_KEYS = 4
_clients_by_key: dict[str, AsyncOpenAI] = {}


def _strip_json_fences(text: str) -> str:
    s = (text or "").strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
        s = re.sub(r"\s*```$", "", s)
    return s.strip()


def _groq_api_keys() -> list[str]:
    """Lista de API keys (máx. MAX_GROQ_KEYS). GROQ_API_KEYS= a,b,c o solo GROQ_API_KEY."""
    s = get_settings()
    multi = (getattr(s, "groq_api_keys", None) or "").strip()
    keys: list[str] = []
    if multi:
        keys = [k.strip() for k in multi.split(",") if k.strip()]
    if not keys:
        one = (s.groq_api_key or "").strip()
        if one:
            keys = [one]
    return keys[:MAX_GROQ_KEYS]


def has_groq_keys() -> bool:
    return bool(_groq_api_keys())


def _groq_client_for_key(api_key: str) -> AsyncOpenAI:
    if not api_key:
        raise RuntimeError("GROQ_API_KEY no configurada.")
    if api_key not in _clients_by_key:
        s = get_settings()
        base = (s.groq_base_url or "https://api.groq.com/openai/v1").rstrip("/")
        _clients_by_key[api_key] = AsyncOpenAI(
            api_key=api_key, base_url=base, timeout=120.0, max_retries=0
        )
    return _clients_by_key[api_key]


def _should_rotate_groq_key(exc: BaseException) -> bool:
    """
    Probar siguiente cuenta: cuota, auth, servicio saturado.
    No rotar ante 400/413 de payload (mismo prompt en todas las cuentas).
    """
    try:
        from openai import APIStatusError

        if isinstance(exc, APIStatusError) and getattr(exc, "status_code", None) is not None:
            code = int(exc.status_code)
            if code in (401, 403, 429, 502, 503):
                return True
    except ImportError:
        pass
    s = str(exc).lower()
    if any(
        x in s
        for x in (
            "401",
            "403",
            "429",
            "rate limit",
            "too many requests",
            "invalid api key",
            "incorrect api key",
            "quota",
            "insufficient",
            "capacity",
        )
    ):
        return True
    return False


def _append_instruction_to_messages(messages: list[dict], instruction: str) -> list[dict]:
    suffix = "\n\n" + (instruction or "").strip()
    out: list[dict] = [dict(m) for m in messages]
    if not out:
        return [{"role": "user", "content": suffix.strip()}]
    last = out[-1]
    if last.get("role") == "user":
        c = last.get("content", "")
        if isinstance(c, list):
            parts: list[str] = []
            for p in c:
                if isinstance(p, dict) and p.get("type") == "text":
                    parts.append(str(p.get("text", "")))
                else:
                    parts.append(json.dumps(p, ensure_ascii=False))
            last["content"] = "\n".join(parts) + suffix
        else:
            last["content"] = ("" if c is None else str(c)) + suffix
    else:
        out.append({"role": "user", "content": suffix.strip()})
    return out


def _append_json_schema_instruction(
    messages: list[dict], response_model: Type[T]
) -> list[dict]:
    raw = json.dumps(response_model.model_json_schema(), ensure_ascii=False)
    schema_hint = raw if len(raw) <= 28000 else raw[:28000] + "…"
    suffix = (
        "\n\nResponde ÚNICAMENTE con un objeto JSON válido (sin markdown ni texto fuera del JSON) "
        "que cumpla este esquema JSON Schema:\n"
        + schema_hint
    )
    out: list[dict] = [dict(m) for m in messages]
    if not out:
        return [{"role": "user", "content": suffix.strip()}]
    last = out[-1]
    if last.get("role") == "user":
        c = last.get("content", "")
        if isinstance(c, list):
            parts: list[str] = []
            for p in c:
                if isinstance(p, dict) and p.get("type") == "text":
                    parts.append(str(p.get("text", "")))
                else:
                    parts.append(json.dumps(p, ensure_ascii=False))
            last["content"] = "\n".join(parts) + suffix
        else:
            last["content"] = ("" if c is None else str(c)) + suffix
    else:
        out.append({"role": "user", "content": suffix.strip()})
    return out


async def chat_completion(
    messages: list[dict],
    model: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 2000,
    tools: Optional[list] = None,
    tool_choice: Optional[str] = None,
) -> dict:
    settings = get_settings()
    keys = _groq_api_keys()
    if not keys:
        raise RuntimeError("GROQ_API_KEY no configurada.")
    m = model or settings.groq_chat_model
    kwargs_base: dict = {
        "model": m,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if tools:
        kwargs_base["tools"] = tools
    if tool_choice:
        kwargs_base["tool_choice"] = tool_choice

    last_exc: Optional[BaseException] = None
    for key_idx, api_key in enumerate(keys):
        client = _groq_client_for_key(api_key)
        try:
            response = await client.chat.completions.create(**kwargs_base)
        except Exception as e:
            last_exc = e
            logger.error("Groq chat completion failed (clave %s/%s): %s", key_idx + 1, len(keys), e)
            if _should_rotate_groq_key(e) and key_idx < len(keys) - 1:
                logger.warning("Rotando a la siguiente clave Groq para chat.")
                continue
            raise

        choice = response.choices[0]
        return {
            "content": choice.message.content,
            "tool_calls": [
                {
                    "id": tc.id,
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in (choice.message.tool_calls or [])
            ],
            "finish_reason": choice.finish_reason,
            "usage": {
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "completion_tokens": response.usage.completion_tokens if response.usage else 0,
            },
        }

    assert last_exc is not None
    raise last_exc


def _is_groq_rate_limit(exc: BaseException) -> bool:
    s = str(exc).lower()
    return "429" in str(exc) or "too many requests" in s or "rate_limit" in s


def _is_groq_payload_too_large(exc: BaseException) -> bool:
    s = str(exc).lower()
    return "413" in str(exc) or "too large" in s or "payload" in s and "large" in s


def _groq_suggested_wait_from_error(exc: BaseException) -> Optional[float]:
    """Parsea 'try again in 310ms' del mensaje de Groq (TPM)."""
    m = re.search(
        r"try again in\s+(\d+(?:\.\d+)?)\s*(ms|milliseconds?|seconds?|secs?|s)\b",
        str(exc),
        re.IGNORECASE,
    )
    if not m:
        return None
    val = float(m.group(1))
    unit = m.group(2).lower()
    sec = val / 1000.0 if unit.startswith("m") else val
    return max(0.001, sec)


async def structured_output(
    messages: list[dict],
    response_model: Type[T],
    model: Optional[str] = None,
    temperature: float = 0.3,
    max_tokens: int = 3000,
    json_instruction: Optional[str] = None,
    max_retries: int = 1,
    system_prompt: Optional[str] = None,
) -> T:
    settings = get_settings()
    keys = _groq_api_keys()
    if not keys:
        raise RuntimeError("GROQ_API_KEY no configurada.")
    m = model or settings.groq_chat_model
    base = list(messages)
    sp = (system_prompt or "").strip()
    if sp:
        base = [{"role": "system", "content": sp}] + base
    if json_instruction:
        adj = _append_instruction_to_messages(base, json_instruction)
    else:
        adj = _append_json_schema_instruction(base, response_model)

    last_exc: Optional[BaseException] = None
    for key_idx, api_key in enumerate(keys):
        client = _groq_client_for_key(api_key)
        for attempt in range(max(1, max_retries)):
            try:
                response = await client.chat.completions.create(
                    model=m,
                    messages=adj,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    response_format={"type": "json_object"},
                )
            except Exception as e:
                last_exc = e
                logger.error(
                    "Groq structured JSON failed (clave %s/%s): %s",
                    key_idx + 1,
                    len(keys),
                    e,
                )
                if _should_rotate_groq_key(e) and key_idx < len(keys) - 1:
                    # Misma org/servicio: rotar sin esperar quema TPM; respeta retry_after de Groq.
                    if _is_groq_rate_limit(e):
                        hint = _groq_suggested_wait_from_error(e)
                        await asyncio.sleep(max(12.0, (hint or 0.0) + 4.0))
                    logger.warning("Rotando a la siguiente clave Groq (planes/JSON).")
                    break
                if attempt < max_retries - 1 and (
                    _is_groq_rate_limit(e) or _is_groq_payload_too_large(e)
                ):
                    hint = _groq_suggested_wait_from_error(e)
                    if _is_groq_rate_limit(e):
                        wait = max(16.0 + attempt * 14.0, (hint or 0.0) + 8.0)
                    else:
                        wait = min(120.0, 12.0 + attempt * 18.0)
                    if _is_groq_payload_too_large(e):
                        wait = max(wait, 8.0)
                    wait = min(180.0, wait)
                    logger.warning(
                        "Reintento Groq %s/%s tras error de cuota/tamaño; espera %.0fs",
                        attempt + 1,
                        max_retries,
                        wait,
                    )
                    await asyncio.sleep(wait)
                    continue
                raise

            choice = response.choices[0]
            if getattr(choice, "finish_reason", None) == "length":
                logger.warning(
                    "Groq finish_reason=length (JSON posiblemente truncado); sube max_tokens o divide el prompt."
                )
                err = ValueError("groq_response_truncated_length")
                last_exc = err
                if attempt < max_retries - 1:
                    await asyncio.sleep(min(20.0, 6.0 + attempt * 5.0))
                    continue
                if key_idx < len(keys) - 1:
                    logger.warning("Truncado: probando siguiente clave Groq.")
                    break
                raise err

            raw = (choice.message.content or "").strip()
            cleaned = _strip_json_fences(raw)
            try:
                return response_model.model_validate_json(cleaned)
            except Exception as e:
                last_exc = e
                logger.error("Groq JSON parse failed: %s; response_len=%d", type(e).__name__, len(cleaned))
                if attempt < max_retries - 1:
                    await asyncio.sleep(min(15.0, 4.0 + attempt * 4.0))
                    continue
                raise

    assert last_exc is not None
    raise last_exc


async def vision_analysis(
    image_url: str,
    prompt: str,
    response_model: Type[T],
    model: Optional[str] = None,
    temperature: float = 0.3,
    max_tokens: int = 3000,
) -> T:
    settings = get_settings()
    keys = _groq_api_keys()
    if not keys:
        raise RuntimeError("GROQ_API_KEY no configurada.")
    m = model or settings.groq_vision_model
    schema_hint = json.dumps(response_model.model_json_schema(), ensure_ascii=False)[:12000]
    full_prompt = (
        f"{prompt}\n\n"
        "Responde ÚNICAMENTE con un objeto JSON válido (sin markdown) que cumpla este esquema:\n"
        f"{schema_hint}"
    )
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": full_prompt},
                {"type": "image_url", "image_url": {"url": image_url}},
            ],
        }
    ]
    last_exc: Optional[BaseException] = None
    for key_idx, api_key in enumerate(keys):
        client = _groq_client_for_key(api_key)
        try:
            response = await client.chat.completions.create(
                model=m,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )
        except Exception as e:
            last_exc = e
            logger.error(
                "Groq vision analysis failed (clave %s/%s): %s",
                key_idx + 1,
                len(keys),
                e,
            )
            if _should_rotate_groq_key(e) and key_idx < len(keys) - 1:
                logger.warning("Rotando a la siguiente clave Groq (visión).")
                continue
            raise

        raw = (response.choices[0].message.content or "").strip()
        cleaned = _strip_json_fences(raw)
        try:
            return response_model.model_validate_json(cleaned)
        except Exception as e:
            logger.error("Groq vision JSON parse failed: %s; response_len=%d", type(e).__name__, len(cleaned))
            raise

    assert last_exc is not None
    raise last_exc
