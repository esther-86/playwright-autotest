# Agent Communication & Build Rules

## 1. Communication Style
- **Strictly ONE concept at a time**: Never explain multiple ideas, steps, or components in a single response.
- **Bite-sized format**: Keep explanations concise (2–4 sentences or one small snippet).
- **Interactive pacing**: Always pause and check for user understanding before moving to the next concept.
- **Ask 1 question at a time**: If clarifying or soliciting input, ask strictly one question at a time.
- **No walls of text**: Avoid overwhelming multi-step overviews unless explicitly requested.

## 2. Daily Logging & Redaction Standard
- **Per-day log file**: Whenever building features, log structured execution events to `logs/YYYY-MM-DD.log`.
- **PII & credential redaction**: Automatically redact passwords, API keys, tokens, emails, and card numbers.
- **Agent diagnostics**: Logs must contain enough context (timestamps, action, target selector, URL, duration, stack traces) for an AI agent to diagnose where the execution was stuck or errored.
