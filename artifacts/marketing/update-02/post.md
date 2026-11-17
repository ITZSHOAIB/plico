# Update 02: Agent evals

Release: v0.5.1 is published.
Image: `out/02-agent-evals-evidence-lens.png` (or the canonical `out/02-agent-evals.png`).

## LinkedIn copy

🚀 Plico v0.5.1 is out: agent evals with scores you can inspect.

Changed two lines in your prompt. The demo looks better. Ship it? 👀

Run the evals first.

Plico now lets you:
📝 Write eval cases in Markdown
🧪 Check outputs and tool calls, or add your own TypeScript scorers
🧑‍⚖️ Use a judge model for criteria that need more than an exact match
📊 Compare against a saved baseline and catch regressions in CI

And when a score makes you go “wait, why?” 🔍

Open the case in Studio. Inspect the trial transcript, tool results, judge reasoning, prompt, and raw answer. Follow the score back to the evidence.

Two commands to start comparing:

plico eval --save-baseline
plico eval --baseline evals/baseline.json

📖 Released in v0.5.1:
https://github.com/ITZSHOAIB/plico/releases/tag/v0.5.1

⚡ npm create plico@latest

What's your current agent testing strategy: evals, manual checks, or “looks good to me”? 😅

#TypeScript #AIAgents #OpenSource
