---
paths:
  - "docs/**"
  - "README.md"
---

# Documents

- Reviewers skim. Each document is as short as it can be while answering the brief's bullet
  list for it (`brief/Growth_Engineer_Challenge.pdf`, "Deliverables" and the section the
  deliverable belongs to). Check the list before calling a document done.
- Say what is true now. Mark what is planned as planned. Nothing is described as done unless
  it was run, and what was not verified is named.
- A number comes with how it was measured: the command or tool, the profile, the date.
- A document states decisions and their reasons, not the conversation that led to them.
- Generated sections (the event table, the contrast tables) are regenerated, never edited by
  hand.
- `docs/decisions/log.md`: one line per decision, newest last, with the decision and the
  reason. An important decision also gets an ADR through `/adr`, and its log line links to
  it.
- English, plain sentences. A reason a person can repeat beats a paragraph.

## What the reviewers open

| Document | It must cover |
|---|---|
| `README.md` | A 60-second tour first (live URL, what to click, where each deliverable lives), then local setup in as few commands as possible, then assumptions and next steps |
| `docs/evaluation-sheet.md` | Every line of the brief in the brief's order: what was built, with what, where to check it. Links and commands, no new claims: a number here is one another document already states with how it was measured |
| `docs/architecture.md` | Two pages and one diagram: structure, major decisions and trade-offs with links to ADRs, the API and integration approach, deployment, infrastructure (hosting, deployment, CI/CD, DNS, CDN and edge, caching, observability, security, reliability), extension points, and what changes if this becomes a production FX Replay system |
| `docs/api.md` | The contract, with an example for every status code |
| `docs/analytics-plan.md` | The generated event table (name, trigger, properties, context, decision informed), the funnel, the primary metric, architecture and tooling, data quality |
| `docs/experiment-proposal.md` | Hypothesis, control, variant, success metric, decision criteria, and a short ranked backlog |
| `docs/ai-workflow.md` | The Claude Code setup, how the pieces work together, where AI improved execution, where its output was corrected or rejected, MCP in use and proposed for production |
| `docs/performance-review.md` | Measured numbers and how they were measured, the decisions behind them, SEO, accessibility, rendering, caching and CDN, production risks |
| `docs/brand-notes.md` | One page the kit's design team could act on: how the kit was implemented, answers to its open questions, the generated contrast tables, each extension with its reason |
