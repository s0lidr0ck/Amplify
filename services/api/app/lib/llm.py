"""Shared LLM helpers reused by content-generation routes."""

from __future__ import annotations

import json
import os
import re
from typing import Callable
from urllib import error, request

try:
    import boto3
except Exception:  # noqa: BLE001
    boto3 = None


class LlmError(RuntimeError):
    """Raised when an LLM request cannot complete."""


def call_ollama_generate(
    model: str,
    prompt: str,
    host: str = "http://127.0.0.1:11434",
    timeout_sec: int = 180,
    on_chunk: Callable[[str], None] | None = None,
) -> str:
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": True,
        "options": {"temperature": 0.15, "top_p": 0.9},
    }
    req = request.Request(
        f"{host.rstrip('/')}/api/generate",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    parts: list[str] = []
    try:
        with request.urlopen(req, timeout=timeout_sec) as resp:
            for raw_line in resp:
                line = raw_line.decode("utf-8").strip()
                if not line:
                    continue
                data = json.loads(line)
                chunk = str(data.get("response", ""))
                if chunk:
                    parts.append(chunk)
                    if on_chunk:
                        on_chunk(chunk)
                if data.get("done"):
                    break
    except error.URLError as exc:
        raise LlmError(
            f"Could not reach Ollama at {host}. Start it with 'ollama serve'. Details: {exc}"
        ) from exc
    except json.JSONDecodeError as exc:
        raise LlmError(f"Ollama returned non-JSON response: {exc}") from exc

    output = "".join(parts).strip()
    if not output:
        raise LlmError("Ollama response did not include generated text.")
    return output


def _resolve_bedrock_region(host: str | None) -> str:
    if host:
        host_value = host.strip()
        if host_value.startswith("bedrock://"):
            region = host_value.replace("bedrock://", "", 1).strip()
            if region:
                return region
        if re.fullmatch(r"[a-z]{2}-[a-z]+-\d", host_value):
            return host_value
    return os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1"


def call_bedrock_generate(
    model: str,
    prompt: str,
    host: str = "",
    timeout_sec: int = 180,
    on_chunk: Callable[[str], None] | None = None,
) -> str:
    if boto3 is None:
        raise LlmError("boto3 is required for Bedrock models.")

    model_id = model.strip()
    if model_id.startswith("bedrock/"):
        model_id = model_id.replace("bedrock/", "", 1).strip()
    elif model_id.startswith("bedrock:"):
        model_id = model_id.replace("bedrock:", "", 1).strip()
    if not model_id:
        raise LlmError("Bedrock model id is missing.")

    region = _resolve_bedrock_region(host)
    client = boto3.client(
        "bedrock-runtime",
        region_name=region,
        config=boto3.session.Config(read_timeout=timeout_sec, connect_timeout=15),
    )

    def _converse(inference_config: dict) -> dict:
        return client.converse_stream(
            modelId=model_id,
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig=inference_config,
        )

    parts: list[str] = []
    try:
        try:
            response = _converse({"temperature": 0.15, "topP": 0.9, "maxTokens": 4096})
        except Exception as exc:  # noqa: BLE001
            message = str(exc)
            if "temperature" in message and "top_p" in message and "both" in message:
                response = _converse({"temperature": 0.15, "maxTokens": 4096})
            else:
                raise

        for event in response.get("stream", []):
            delta = (((event or {}).get("contentBlockDelta") or {}).get("delta") or {}).get("text")
            if delta:
                text = str(delta)
                parts.append(text)
                if on_chunk:
                    on_chunk(text)
    except Exception as exc:  # noqa: BLE001
        raise LlmError(
            f"Bedrock request failed for model '{model_id}' in region '{region}'. Details: {exc}"
        ) from exc

    output = "".join(parts).strip()
    if not output:
        raise LlmError("Bedrock response did not include generated text.")
    return output


def _looks_like_bedrock_model_id(model: str) -> bool:
    value = (model or "").strip()
    if not value:
        return False
    if value.startswith("arn:aws:bedrock:"):
        return True
    return bool(
        re.match(
            (
                r"^(?:[a-z]{2}\.)?"
                r"(anthropic|amazon|ai21|cohere|meta|mistral|deepseek|google|openai|"
                r"qwen|stability|writer|nvidia|minimax|moonshotai|moonshot|zai|twelvelabs)\."
            ),
            value,
        )
    )


def call_llm_generate(
    model: str,
    prompt: str,
    host: str = "http://127.0.0.1:11434",
    timeout_sec: int = 180,
    on_chunk: Callable[[str], None] | None = None,
) -> str:
    if (
        model.startswith("bedrock/")
        or model.startswith("bedrock:")
        or _looks_like_bedrock_model_id(model)
    ):
        return call_bedrock_generate(model=model, prompt=prompt, host=host, timeout_sec=timeout_sec, on_chunk=on_chunk)
    return call_ollama_generate(model=model, prompt=prompt, host=host, timeout_sec=timeout_sec, on_chunk=on_chunk)
