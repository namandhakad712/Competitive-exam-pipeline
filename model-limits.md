## CEREBRAS

**Limits – Model Quotas & Rate Limits**  

---  

| Model | Environment | Max Context Length | **Requests** (per) | **Tokens** (per) |
|-------|-------------|-------------------|--------------------|------------------|
| **gpt-oss-120b** | Production | 65,536 | • Minute: **5**  <br>• Hour: **150**  <br>• Day: **2,400** | • Minute: **30,000**  <br>• Hour: **1,000,000**  <br>• Day: **1,000,000** |
| **llama3.1-8b** | Production | 8,192 | • Minute: **5**  <br>• Hour: **150**  <br>• Day: **2,400** | • Minute: **30,000**  <br>• Hour: **1,000,000**  <br>• Day: **1,000,000** |
| **qwen-3-235b-a22b-instruct-2507** | Preview | 65,536 | • Minute: **5**  <br>• Hour: **150**  <br>• Day: **2,400** | • Minute: **30,000**  <br>• Hour: **1,000,000**  <br>• Day: **1,000,000** |
| **zai-glm-4.7** | Preview | 64,000 | • Minute: **5**  <br>• Hour: **150**  <br>• Day: **2,400** | • Minute: **30,000**  <br>• Hour: **1,000,000**  <br>• Day: **1,000,000** |

---

### How to View Usage
- Go to the **Analytics** tab in the platform UI to see real‑time consumption for each model.

### Important Note
- Rate limits can be enforced over shorter intervals (e.g., a 60 RPM limit might be applied as 1 request/second) to prevent abuse and ensure fair access for all users.  


## MISTRAL AI

Below is the same information reformatted as a Markdown document. You can copy‑paste it directly into any `.md` file or markdown editor.

---  

## Model Completion Rate Limits  

| Model | Tokens / Minute | Tokens / Month | Requests / Second |
|-------|----------------:|---------------:|-------------------:|
| **codestral-2508** | 625 000 | – | 2.08 |
| **codestral-embed** | 50 000 | 4 000 000 | 1.00 |
| **devstral-2512** | 50 000 | 4 000 000 | 1.00 |
| **devstral-medium-2507** | 50 000 | 4 000 000 | 1.00 |
| **devstral-small-2507** | 50 000 | 4 000 000 | 1.00 |
| **labs-leanstral-2603** | 5 000 000 | – | 0.63 |
| **magistral-medium-2509** | 75 000 | 1 000 000 000 | 0.08 |
| **magistral-small-2509** | 75 000 | 1 000 000 000 | 0.08 |
| **ministral-14b-2512** | 937 500 | – | 0.50 |
| **ministral-3b-2512** | 1 300 000 | – | 12.50 |
| **ministral-8b-2512** | 625 000 | – | 3.13 |
| **mistral-embed-2312** | 20 000 000 | 200 000 000 000 | 1.00 |
| **mistral-large-2411** | 600 000 | 200 000 000 000 | 0.43 |
| **mistral-large-2512** | 50 000 | 4 000 000 | 1.00 |
| **mistral-medium-2505** | 375 000 | – | 0.42 |
| **mistral-medium-2508** | 356 250 | – | 0.38 |
| **mistral-medium-3-5** | 50 000 | 4 000 000 | 1.00 |
| **mistral-moderation-2411** | 50 000 | 4 000 000 | 1.67 |
| **mistral-moderation-2603** | 50 000 | 4 000 000 | 1.67 |
| **mistral-ocr-2505** | 50 000 | 4 000 000 | 1.00 |
| **mistral-ocr-2512** | 50 000 | 4 000 000 | 1.00 |
| **mistral-small-2506** | 2 250 000 | – | 5.00 |
| **mistral-small-2603** | 50 000 | – | 0.83 |
| **mistral-vibe-cli-latest** | 375 000 | – | 0.42 |
| **open-mistral-nemo** | 937 500 | – | 0.50 |
| **pixtral-large-2411** | 50 000 | 4 000 000 | 1.00 |
| **voxtral-mini-2507** | 50 000 | – | 1.00 |
| **voxtral-mini-2602** | 50 000 | 4 000 000 | 1.00 |
| **voxtral-mini-transcribe-2507** | 50 000 | – | 1.00 |
| **voxtral-mini-transcribe-realtime-2602** | 50 000 | – | 1.00 |
| **voxtral-mini-tts-2603** | 50 000 | 4 000 000 | 1.00 |
| **voxtral-small-2507** | 50 000 | – | 1.00 |

> **Note:** If you need to raise any of these limits, please contact support via the “Support” button and provide details about your specific use case.

---  

## Fine‑tuning Limits  

| Limit | Value |
|-------|------:|
| **Maximum concurrent jobs** | 1 |
| **Maximum tokens per job** | 20 000 000 |
| **Maximum number of jobs per month** | 3 |

## GEMINI AI

## Rate Limits by Model (Last 7 days)

### Models  

| Model | Category | RPM | TPM | RPD |
|---|---|---|---|---|
| Gemini Embedding 2 | Other models | 1 / 100 | 44 / 30K | 1 / 1K |
| Gemini 2.5 Flash | Text‑out models | 0 / 5 | 0 / 250K | 0 / 20 |
| Gemini 2.5 Pro | Text‑out models | 0 / 0 | 0 / 0 | 0 / 0 |
| Gemini 2 Flash | Text‑out models | 0 / 0 | 0 / 0 | 0 / 0 |
| Gemini 2 Flash Lite | Text‑out models | 0 / 0 | 0 / 0 | 0 / 0 |
| Gemini 2.5 Flash TTS | Multi‑modal generative models | 0 / 3 | 0 / 10K | 0 / 10 |
| Gemini 2.5 Pro TTS | Multi‑modal generative models | 0 / 0 | 0 / 0 | 0 / 0 |
| Imagen 4 Generate | Multi‑modal generative models | – | – | 0 / 25 |
| Imagen 4 Ultra Generate | Multi‑modal generative models | – | – | 0 / 25 |
| Imagen 4 Fast Generate | Multi‑modal generative models | – | – | 0 / 25 |
| Gemma 4 26B | Other models | 0 / 15 | 0 / Unlimited | 0 / 1.5K |
| Gemma 4 31B | Other models | 0 / 15 | 0 / Unlimited | 0 / 1.5K |
| Gemini Embedding 1 | Other models | 0 / 100 | 0 / 30K | 0 / 1K |
| Gemini 3.5 Flash | Text‑out models | 0 / 5 | 0 / 250K | 0 / 20 |
| Gemini 3.1 Flash Lite | Text‑out models | 0 / 15 | 0 / 250K | 0 / 500 |
| Gemini 3.1 Pro | Text‑out models | 0 / 0 | 0 / 0 | 0 / 0 |
| Gemini 2.5 Flash Lite | Text‑out models | 0 / 10 | 0 / 250K | 0 / 20 |
| Nano Banana (Gemini 2.5 Flash Preview Image) | Multi‑modal generative models | 0 / 0 | 0 / 0 | 0 / 0 |
| Gemini 3 Flash | Text‑out models | 0 / 5 | 0 / 250K | 0 / 20 |
| Nano Banana Pro (Gemini 3 Pro Image) | Multi‑modal generative models | 0 / 0 | 0 / 0 | 0 / 0 |
| Nano Banana 2 (Gemini 3.1 Flash Image) | Multi‑modal generative models | 0 / 0 | 0 / 0 | 0 / 0 |
| Lyria 3 Clip | Multi‑modal generative models | 0 / 0 | 0 / 0 | 0 / 0 |
| Lyria 3 Pro | Multi‑modal generative models | 0 / 0 | 0 / 0 | 0 / 0 |
| Veo 3 Generate | Multi‑modal generative models | 0 / 0 | – | 0 / 0 |
| Veo 3 Fast Generate | Multi‑modal generative models | 0 / 0 | – | 0 / 0 |
| Veo 3 Lite Generate | Multi‑modal generative models | 0 / 0 | – | 0 / 0 |
| Gemini 3.1 Flash TTS | Multi‑modal generative models | 0 / 3 | 0 / 10K | 0 / 10 |
| Gemini Robotics ER 1.5 Preview | Other models | 0 / 10 | 0 / 250K | 0 / 20 |
| Gemini Robotics ER 1.6 Preview | Other models | 0 / 5 | 0 / 250K | 0 / 20 |
| Computer Use Preview | Other models | 0 / 0 | 0 / 0 | 0 / 0 |
| Antigravity | Agents | 0 / 0 | 0 / 0 | 0 / 0 |
| Deep Research Pro Preview | Agents | 0 / 0 | 0 / 0 | 0 / 0 |
| Gemini 2.5 Flash Native Audio Dialog | Live API | 0 / Unlimited | 0 / 1M | 0 / Unlimited |
| Gemini 3 Flash Live | Live API | 0 / Unlimited | 0 / 65K | 0 / Unlimited |

### Tools  

| Tool | Category | RPM | TPM | RPD |
|---|---|---|---|---|
| Gemini 2.5 Flash – Map grounding | – | – | – | 0 / 500 |
| Gemini 2.5 Pro – Map grounding | – | – | – | 0 / 0 |
| Gemini 3.5 Flash – Map grounding | – | – | – | 0 / 0 |
| Gemini 3.1 Flash Lite – Map grounding | – | – | – | 0 / 500 |
| Gemini 3.1 Pro – Map grounding | – | – | – | 0 / 0 |
| Gemini 2.5 Flash Lite – Map grounding | – | – | – | 0 / 500 |
| Gemini 3 Flash – Map grounding | – | – | – | 0 / 0 |
| Gemini 3.1 Flash TTS – Map grounding | – | – | – | 0 / 500 |
| Gemini Robotics ER 1.6 Preview – Map grounding | – | – | – | 0 / 500 |
| Computer Use Preview – Map grounding | – | – | – | 0 / 500 |
| Deep Research Pro Preview – Map grounding | – | – | – | 0 / 500 |
| Gemini 2 – Search grounding | – | – | – | 0 / 1.5K |
| Gemini 2.5 – Search grounding | – | – | – | 0 / 1.5K |
| Gemini 3 – Search grounding | – | – | – | 0 / 0 |
| Default – Search grounding | – | – | – | 0 / 1.5K |

## VANCHIN AI-KATCODER-AIR

# KAT‑Coder‑Air‑V1 – System Overview  

---

## 📋 Basic Information  

| Field | Value |
|-------|-------|
| **Name** | `KAT‑Coder‑Air‑V1` |
| **ID** | `ep-8jt098-1774548880917375225` |
| **Creation Time** | 2026‑03‑26 23:44:41 (UTC) |
| **Update Time** | 2026‑05‑18 10:21:49 (UTC) |

---

## 🔧 Access Configuration  

| Category | Setting |
|----------|---------|
| **Models** | `KAT‑Coder‑Air‑V1` |
| **Model Throttling** | **20 RPM** / **2 000 000 TPM** |
| **Endpoint Throttling** | *None* |

## POOLSIDE M.1

FREE PREVIEW , UNLIMTED MODEL IN NEW LAUNCH
131K CONTEXT WINDOW.

## LONGCAT AI


# LongCat API Platform – Model Specs

This document provides a concise reference of all models currently available on the LongCat API Platform, including their supported API formats, description, context windows, maximum output length, daily free quota, and any special notes.

---

## Table of Contents
- [Supported Models Overview](#supported-models-overview)
- [Model Details](#model-details)
  - [LongCat‑Flash‑Chat](#longcat-flash-chat)
  - [LongCat‑Flash‑Thinking / LongCat‑Flash‑Thinking‑2601](#longcat-flash-thinking--longcat-flash-thinking-2601)
  - [LongCat‑Flash‑Lite](#longcat-flash-lite)
  - [LongCat‑Flash‑Omni‑2603](#longcat-flash-omni-2603)
  - [LongCat‑Flash‑Chat‑2602‑Exp](#longcat-flash-chat-2602-exp)
  - [LongCat‑2.0‑Preview](#longcat-20-preview)
- [Quota & Rate‑Limiting Summary](#quota--rate-limiting-summary)
- [Quick Reference Cheat‑Sheet](#quick-reference-cheat-sheet)

---

## Supported Models Overview

| Model | API Format(s) | Description | Context Window | Max Output Tokens* | Daily Free Quota |
|-------|---------------|-------------|----------------|-------------------|------------------|
| **LongCat‑Flash‑Chat** | OpenAI / Anthropic | High‑performance general‑purpose chat model | 256 K tokens | 256 K tokens | 500 k tokens (standard models) |
| **LongCat‑Flash‑Thinking** | OpenAI / Anthropic | Deep‑thinking model (legacy name) | 256 K tokens | 256 K tokens | 500 k tokens |
| **LongCat‑Flash‑Thinking‑2601** | OpenAI / Anthropic | Upgraded deep‑thinking model (replaces Flash‑Thinking) | 256 K tokens | 256 K tokens | 500 k tokens |
| **LongCat‑Flash‑Lite** | OpenAI / Anthropic | Efficient Mixture‑of‑Experts (MoE) model | 256 K tokens | 256 K tokens | 50 M tokens |
| **LongCat‑Flash‑Omni‑2603** | OpenAI | Multi‑Modal model (image + text) | 128 K tokens | 256 K tokens | 500 k tokens |
| **LongCat‑Flash‑Chat‑2602‑Exp** | OpenAI | High‑performance chat (experimental) | 256 K tokens | 256 K tokens | 500 k tokens |
| **LongCat‑2.0‑Preview** | OpenAI / Anthropic | High‑performance agentic model (beta) | 1 M tokens | 64 K tokens | 5 M tokens (plus feedback‑earned quota) |

\* *Maximum output tokens are the same as the context window unless otherwise noted (e.g., LongCat‑2.0‑Preview caps output at 64 K).*

---

## Model Details

### LongCat‑Flash‑Chat
- **Supported API formats**: OpenAI (`/v1/chat/completions`) & Anthropic (`/v1/messages`)
- **Typical use‑case**: Conversational assistants, Q&A, code generation, summarisation.
- **Context window**: 256 K tokens (≈ 150 MiB of text).
- **Max output**: 256 K tokens (subject to request `max_tokens`).
- **Daily free quota**: 500 k tokens (shared with other standard models).
- **Notes**: Recommended default for most chat workloads.

### LongCat‑Flash‑Thinking / LongCat‑Flash‑Thinking‑2601
- **Supported API formats**: OpenAI & Anthropic.
- **Purpose**: Deep reasoning, chain‑of‑thought, complex problem solving.
- **Context window**: 256 K tokens.
- **Max output**: 256 K tokens.
- **Daily free quota**: 500 k tokens.
- **Version note**: `LongCat‑Flash‑Thinking` is an alias for `LongCat‑Flash‑Thinking‑2601` (upgrade performed on 2026‑03‑12).

### LongCat‑Flash‑Lite
- **Supported API formats**: OpenAI & Anthropic.
- **Purpose**: Cost‑effective, high‑throughput workloads; MoE architecture reduces latency.
- **Context window**: 256 K tokens.
- **Max output**: 256 K tokens.
- **Daily free quota**: 50 M tokens (large allowance, **no quota upgrades**).
- **Notes**: Ideal for bulk processing, embeddings, or low‑latency chat.

### LongCat‑Flash‑Omni‑2603
- **Supported API format**: OpenAI only.
- **Purpose**: Multi‑modal (text + image) generation and understanding.
- **Context window**: 128 K tokens (image tokens count toward this limit).
- **Max output**: 256 K tokens.
- **Daily free quota**: 500 k tokens.
- **Special header**: For image payloads use `multipart/form-data` as described in the Multi‑Modal API docs.

### LongCat‑Flash‑Chat‑2602‑Exp
- **Supported API format**: OpenAI only.
- **Purpose**: Experimental improvements over `Flash‑Chat` (tuned for speed & quality).
- **Context window**: 256 K tokens.
- **Max output**: 256 K tokens.
- **Daily free quota**: 500 k tokens.
- **Notes**: May be deprecated in future releases; keep an eye on the changelog.

### LongCat‑2.0‑Preview
- **Supported API formats**: OpenAI & Anthropic.
- **Purpose**: Agentic reasoning, tool‑use, planning, and self‑reflection.
- **Context window**: 1 M tokens (≈ 600 MiB) – the largest on the platform.
- **Max output**: 64 K tokens (hard cap to protect against runaway generation).
- **Daily free quota**: 5 M tokens **plus** feedback‑earned refreshes (max 120 M tokens/day).
- **Notes**: Beta model; you must include `anthropic-version: 2023‑06‑01` header when using Anthropic format.

---

## Quota & Rate‑Limiting Summary

| Metric | Value |
|--------|-------|
| **Daily free quota** (standard models) | 500 k tokens |
| **Daily free quota** (Flash‑Lite) | 50 M tokens |
| **Daily free quota** (2.0‑Preview) | 5 M tokens + optional refresh |
| **Context length limits** | See table above |
| **Maximum request size** | 256 K tokens (except Omni‑2603: 128 K; 2.0‑Preview: 1 M) |
| **Rate‑limit response** | HTTP 429 with `retry_after` (seconds) |
| **Recommended retry** | Exponential back‑off (e.g., 1 s → 2 s → 4 s …) |




## NVIDIA NIM (ALL 40RPM)

| Model | Environment | Max Context Length | Requests (per min) | Tokens (per min) | Max Output Tokens | Modality | Notes & Extra Features |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **minimax-m2.7** | Production | $204,800$ | $40$ | $30,000$ | $8,192$ | Text | $230\text{B}$ MoE ($10\text{B}$ active). Built for long-horizon software engineering and live production troubleshooting. Supports autonomous programming scaffolds. |
| **mistral-large-3-675b** | Production | $262,144$ | $40$ | $30,000$ | Undisclosed | Multimodal | $675\text{B}$ granular MoE ($41\text{B}$ active). Features a $2.5\text{B}$ Vision Encoder. Optimized for native function calling and enterprise workflow automation. |
| **step-3.5-flash** | Production | $256,000$ | $40$ | $30,000$ | Configurable | Text | $196.81\text{B}$ sparse MoE ($\sim11\text{B}$ active). Utilizes 3-way Multi-Token Prediction (MTP-3) achieving extreme throughput ($100$-$350\text{s}$). |
| **seed-oss-36b-instruct** | Production | $512,000$ | $40$ | $30,000$ | Configurable | Text | $36\text{B}$ dense parameter model by ByteDance. Features native $512\text{k}$ long-context handling and flexible user-controlled reasoning thinking budgets. |
| **qwen3-coder-480b** | Production | $262,144$ | $40$ | $30,000$ | Configurable | Text/Code | $480\text{B}$ MoE ($35\text{B}$ active) with $160$ experts. Native $262\text{k}$ context extendable up to $1\text{M}$ via YaRN. No internal `<think>` block structures. |
| **mistral-nemotron** | Production | $128,000$ | $40$ | $30,000$ | Configurable | Text | Optimized by NVIDIA for extreme instruction-following accuracy and low-latency structured tool execution in complex agentic loops. |
| **llama-4-maverick** | Production | $1,000,000$ | $40$ | $30,000$ | Configurable | Multimodal | Next-gen Meta model. $400\text{B}$ total MoE ($17\text{B}$ active) with $128$ experts. Natively fuses text and image processing with massive $1\text{M}$ context. |
| **dracarys-llama-3.1-70b**| Production | $128,000$ | $40$ | $30,000$ | Configurable | Text | Abacus.AI fine-tune of Llama 3.1. Substantially boosts LiveCodeBench score performance relative to the stock base checkpoint. |
| **solar-10.7b-instruct** | Production | $4,096$ | $40$ | $30,000$ | Configurable | Text | Upstage model built using Depth Up-Scaling (DUS) to merge Mistral layers. Highly efficient single-turn instruction-following performance. |
| **kimi-k2.6** | Production | $256,000$ | $40$ | $30,000$ | $20,480$ | Omni-modal | Moonshot AI flagship. $1\text{T}$ total MoE ($32\text{B}$ active). Controls up to $300$ sub-agents across $4,000$ steps. Natively parses text, image, and video. |
| **deepseek-v4-pro** | Production | $1,000,000$ | $40$ | $30,000$ | Configurable | Text | $1.6\text{T}$ MoE ($49\text{B}$ active). Employs CSA/HCA hybrid attention to slash inference compute. Supports High/Max advanced reasoning tracks. |
| **glm-5.1** | Production | $131,072$ | $40$ | $30,000$ | $131,072$ | Text | $754\text{B}$ flagship MoE with Dense-Sparse-Alternating (DSA) structure. Sustains deep logic over hundreds of reasoning cycles. |
| **deepseek-v4-flash** | Production | $1,000,000$ | $40$ | $30,000$ | Configurable | Text | $284\text{B}$ MoE ($13\text{B}$ active) lightweight alternative. Retains full $1\text{M}$ context window optimized for rapid agentic routing. |
| **nemotron-3-nano-omni** | Production | $256,000$ | $40$ | $30,000$ | $20,480$ | Omni-modal | $31\text{B}$ hybrid Mamba2-Transformer MoE. Unifies text, image, video (up to 2 min), and native audio voice stream transcription. |
| **sarvam-m** | Production | $32,768$ | $40$ | $30,000$ | $8,192$ | Text | $23.6\text{B}$ hybrid-reasoning model based on Mistral-Small. Custom-built for Indian language tasks (covering 11 Indic tongues natively). |
| **llama-3.1-70b-instruct**| Production | $128,000$ | $40$ | $30,000$ | $4,096$ | Text | Meta classic text baseline utilizing Grouped-Query Attention (GQA). Highly optimized for multilingual balance and function calling safety. |
