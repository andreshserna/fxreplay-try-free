# 0012. Models by kind of work: Fable where judgment decides, Opus for specified work

- **Status:** accepted
- **Date:** 2026-11-18
- **Phase:** 2

## Context

ADR 0010 put every agent on Fable at the highest effort and accepted high token use as the
price. The price turned out to matter: the research run alone used about 494,000 tokens, and
a usage limit stopped the first code review partway through. Much of what remains is not
judgment. It is work whose correct result can be written down beforehand and checked
afterwards: a statistics script against textbook values, an API client against the contract,
an audit against a list of budgets.

## Options considered

1. **Keep Fable everywhere.** The simplest rule and the deepest reviews, at a cost that
   already interrupted the work once.
2. **Split by kind of work.** Fable where a decision or a critique is the output. Opus 5.5
   where the output is specified in advance and verified by tests or by a tool.
3. **Opus everywhere.** The cheapest, and it gives up depth exactly where a wrong call is
   expensive: architecture, measurement design, code review.

## Decision

Option 2.

| Work | Model |
|---|---|
| The main session: architecture, the API and measurement design, the design loop, the documents | Fable |
| `code-reviewer`, `design-critic`, `experiment-analyst`: the output is a judgment | Fable, effort `max` |
| `analytics-qa`, `web-quality-auditor`, `growth-researcher`: the output is evidence against a checklist | Opus 5.5 |
| `implementer`: code and tests from a written specification, reviewed before it is committed | Opus 5.5 |

Work is delegated only when its specification and its check both exist first. The main
session reads every delegated diff and runs its tests before committing it.

## Consequences

- Fable's budget goes to the decisions a reviewer will ask about.
- Each delegation needs a specification good enough to hand over, which is also what makes
  the result checkable.
- A delegated result can be confidently wrong, so nothing delegated is committed unread, and
  `code-reviewer` still sees it at the end of the phase.
- The rule about fallbacks stands: an agent that ran on another model than its file names
  says so in the first line of its report.
- **Cost to change later:** trivial. One line per agent file.
