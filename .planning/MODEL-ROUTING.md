# Model Routing & Agent Swarm Policy

**This is an on-demand reference. Nothing loads it automatically.** It is deliberately not imported from `CLAUDE.md`, so it costs zero tokens per turn.

To apply it, say this at the start of a phase:

> Read `.planning/MODEL-ROUTING.md` and follow it for this phase.

---

## 0. How routing actually works here (read this first)

Read this section before acting on the rest. Three mechanisms people assume exist do not, and building on them wastes a wave.

**The real routing table** is `MODEL_PROFILES` in `~/.claude/get-shit-done/bin/gsd-tools.cjs` (line ~132). The only resolver that GSD workflows call is `cmdResolveModel` (line ~1426). Everything below is downstream of those two.

Resolution is a single lookup: `.planning/config.json` → `model_profile` → agent row → model. That's it.

### `model_overrides` does not work — do not use it

`~/.claude/get-shit-done/references/model-profiles.md` documents a per-agent `model_overrides` block in `.planning/config.json`. It has no effect:

- `loadConfig()` (line ~191) returns a fixed 11-key object. `model_overrides` is not one of them, so it never reaches any consumer.
- `resolveModelInternal` (line ~4046) reads `config.model_overrides?.[agentType]` — always `undefined` per the above.
- `cmdResolveModel` (line ~1426), the function actually behind the `resolve-model` CLI command every workflow calls, never checks overrides at all.

Adding `model_overrides` to `config.json` fails silently. Per-agent routing is not available. Change `model_profile` instead, or pass `model=` explicitly when hand-spawning a Task.

### Fable cannot be routed to

`cmdResolveModel` emits only `inherit`, `sonnet`, or `haiku`. No profile row contains `fable`. Any Fable step in the ladder below requires **you** switching the session model by hand — no agent spawn can reach it.

### "Opus" means "inherit", not a pinned model

Line ~1442 maps `opus` → `inherit`. Opus-tier agents adopt **the parent session's model**. They are Opus 4.8 only because this session is (`~/.claude/settings.json` → `"model": "opus"`). Switch the session to Sonnet and every "Opus" agent below silently becomes Sonnet, with no warning.

---

## 1. Core model policy

| Model | Role | When to use |
|---|---|---|
| **Sonnet** | Default executor | Almost all implementation, short tasks, tests, docs, small refactors, GSD execute steps |
| **Opus** | Planner / critical reviewer | Architecture, phase planning, critical design, complex multi-file debugging, high-risk decisions |
| **Fable** | Frontier / complex only | Large migrations, novel agent systems, multi-day ambiguous design, deep research synthesis when Opus is not enough |

Rules:

- Start every phase on the cheapest correct model.
- Escalate only when quality or risk requires it.
- After planning on Opus/Fable, return to Sonnet for execution.
- Never use Opus/Fable for routine CRUD, formatting, simple tests, or docs.

## 2. Model by GSD phase

Current profile: **`budget`** (`.planning/config.json`) — set 2026-07-14 at the user's explicit direction to conserve tokens. The "resolves to (balanced)" column below is NOT what runs today.

> ### ⚠ STANDING SPAWN-TIME OVERRIDE (2026-07-14)
>
> **Research always runs on `fable`. Planning always runs on `opus`.** This overrides the `budget` profile and restores this section's Opus-planning rule. Execution/verification stay on `budget`.
>
> | Agent | Actual model | Source |
> | --- | --- | --- |
> | gsd-phase-researcher, gsd-project-researcher | **fable** | override |
> | gsd-planner, gsd-roadmapper | **opus** | override |
> | gsd-executor, gsd-debugger | sonnet | budget |
> | gsd-verifier, gsd-plan-checker, mappers | haiku | budget |
>
> **This is NOT configurable — do not try to express it in `config.json`.** Verified in `gsd-tools.cjs`: workflows resolve via `init` → `resolveModelInternal` (~L808), which never reads `model_overrides` (only `cmdResolveModel` ~L4046 does, and no workflow calls it). No `MODEL_PROFILES` row contains `fable`, and `opus` is rewritten to `inherit`. §3's "no agent spawn can reach Fable" is therefore true *of config* — but an orchestrator CAN pass `model="fable"` directly on the Task/Agent spawn, which is how this override is enforced.
>
> **Enforcement:** the orchestrator ignores `researcher_model` / `planner_model` from `gsd-tools init` and passes `model=` explicitly. If a future planning/research run shows sonnet or haiku, this override was missed.

| Phase | Real GSD agent | Resolves to (balanced — NOT current) | Policy intent |
|---|---|---|---|
| Research | `gsd-phase-researcher`, `gsd-project-researcher` | sonnet | Sonnet default |
| Research synthesis | `gsd-research-synthesizer` | sonnet | Sonnet |
| Planning | `gsd-planner` | **inherit → Opus 4.8** | Opus |
| Roadmapping | `gsd-roadmapper` | sonnet | Sonnet |
| Coding / execute | `gsd-executor` | sonnet | Sonnet |
| Plan check | `gsd-plan-checker` | sonnet | Sonnet |
| Verification | `gsd-verifier`, `gsd-integration-checker` | sonnet | Sonnet |
| Debugging | `gsd-debugger` | sonnet | Sonnet, escalate to Opus |
| Codebase mapping | `gsd-codebase-mapper` | haiku | Cheap, bulk read |

Escalation triggers per phase:

- **Research** → Opus for architecture tradeoffs, security-sensitive design, multi-system integration choices. Fable only for a genuinely novel domain.
- **Planning** → Sonnet is fine when the plan is local and low-risk. Fable only for large migration / new platform / high ambiguity.
- **Coding** → Opus for cross-cutting refactors, auth/data-integrity risk, or repeated Sonnet failure. Never Fable for normal coding.
- **Testing** → Opus for flaky multi-system bugs, race conditions, complex integration failures.
- **Docs / polish** → Always Sonnet. No swarm unless many independent files.
- **Final review** → Opus for critical path, Sonnet for checklist cleanup.

Because per-agent overrides don't work, escalating a single phase means either switching `model_profile` for the duration or spawning that agent by hand with an explicit `model=`.

Every plan output must include: phase goals, short tasks (15–45 min), files touched, acceptance checks, risks + rollback notes.

## 3. Swarm roles

| Role | Model | Responsibility | Max task size |
|---|---|---|---|
| **Orchestrator** | Opus (planning) / Sonnet (execution) | Assign tasks, merge results, decide escalation | Full phase |
| **Researcher** | Sonnet (Opus if hard) | Investigate one topic, return findings | 1 topic |
| **Planner** | Opus | Convert findings into executable short tasks | 1 plan artifact |
| **Coder** | Sonnet | Implement one short coding task | 1–5 files |
| **Tester** | Sonnet | Write/run tests for one unit/feature | 1 feature slice |
| **Verifier** | Sonnet (Opus if critical) | Check acceptance criteria, report pass/fail | 1 checklist |
| **Fixer** | Sonnet first, Opus if stuck | Repair failed verification only | 1 failure cluster |
| **Synthesizer** | Sonnet | Combine multi-agent outputs into one summary | 1 merge report |

Design principles:

1. Keep each agent task atomic — one goal, one output, one verification.
2. Prefer many short tasks over one giant task.
3. Parallelize only independent work.
4. One orchestrator owns integration and quality.
5. Re-merge results into GSD phase notes before the next wave.
6. Fail fast — if a short task fails twice, escalate model or replan.

## 4. Swarm wave pattern

**GSD already does this.** `.planning/config.json` has `parallelization: true`, and `/gsd:execute-phase` runs wave-based parallel execution natively. This section describes how to work *with* that, not a second parallel system to build alongside it.

Waves of 2–4 independent tasks, max:

1. Orchestrator picks 2–4 independent short tasks.
2. Spawn Coder agents in parallel (Sonnet).
3. Each Coder returns: files changed, summary, residual risks.
4. Spawn Tester agents for completed tasks.
5. Verifier checks acceptance.
6. Fixer handles failures only.
7. Orchestrator merges and locks the wave before the next one.

**Never parallelize dependent tasks in the same wave.**

Per-phase shapes:

- **Research**: 2–4 parallel Researchers (libraries/options · architecture patterns · risks/edge cases · reference implementations), then 1 Synthesizer producing ranked options + a recommendation.
- **Planning**: 1 Planner (Opus) produces the plan + short-task backlog. Optional Verifier checks completeness — acceptance criteria present, dependencies ordered, tasks short enough.
- **Testing**: Tester A (unit) · Tester B (integration smoke) · Verifier (acceptance matrix) · Fixer (failing cases only).

## 5. Short-task definition (mandatory)

```
TASK_ID: P{phase}-W{wave}-T{n}
GOAL: one sentence
MODEL: Sonnet | Opus | Fable
SCOPE:
- files:
- out of scope:
INPUTS:
- prior artifacts:
OUTPUT:
- concrete deliverable
ACCEPTANCE:
- checklist item 1
- checklist item 2
MAX ATTEMPTS: 2
ESCALATION:
- attempt 1 fail -> retry with better context
- attempt 2 fail -> escalate model or replan
```

Sizing rules:

- 15–45 minutes of agent work.
- ≤ 5 files per coding task.
- One concern only — UI **or** API **or** schema **or** tests, never all.
- Must be independently verifiable.

## 6. Escalation ladder

1. **Sonnet** implements the short task.
2. Incomplete/wrong once → retry Sonnet with tighter constraints.
3. Still failing or high-risk → **Opus** for redesign/debug.
4. Still conceptually unresolved (migration / novel system) → **Fable**, plan only.
5. Return to **Sonnet** for re-execution.

Steps 3 and 4 require a **manual session-model switch** — see §0. No agent spawn reaches Fable, and "Opus" only means "whatever the session is running."

Hard bans:

- No Fable for routine coding.
- No Opus for pure docs/formatting.
- No full-phase swarm with mixed dependent tasks.

## 7. Profiles

These are GSD's three real `model_profile` values, not a parallel vocabulary. Set via `.planning/config.json` (or `/gsd:set-profile`).

| Agent | `quality` | `balanced` | `budget` ← current |
|---|---|---|---|
| gsd-planner | opus | **opus** | sonnet |
| gsd-roadmapper | opus | sonnet | sonnet |
| gsd-executor | opus | sonnet | sonnet |
| gsd-phase-researcher | opus | sonnet | haiku |
| gsd-project-researcher | opus | sonnet | haiku |
| gsd-research-synthesizer | sonnet | sonnet | haiku |
| gsd-debugger | opus | sonnet | sonnet |
| gsd-codebase-mapper | sonnet | haiku | haiku |
| gsd-verifier | sonnet | sonnet | haiku |
| gsd-plan-checker | sonnet | sonnet | haiku |
| gsd-integration-checker | sonnet | sonnet | haiku |

- **`balanced`** — the documented default for this project. Matches the policy in §1–2. **Not currently active.**
- **`quality`** — high-risk systems (auth, data integrity). Opus for research/planning/coding/debugging. Materially more expensive per phase.
- **`budget`** ← **CURRENTLY ACTIVE** (set 2026-07-14 at the user's explicit direction, to conserve tokens). Sonnet/Haiku throughout, planner drops to Sonnet. Contradicts §2's Opus-planning rule; use only when cost dominates correctness. Phases 2 and 3 were planned under this profile and both passed plan-check on the first iteration.

Remember `opus` → `inherit`, so a `quality` profile on a Sonnet session buys nothing.

## 8. Orchestrator behavior

At the start of each phase, state:

1. Phase name
2. Model profile in use
3. Swarm roles to spawn
4. Wave plan (short tasks)
5. Success criteria

At the end of each wave, report:

- Completed tasks
- Failed tasks + root cause
- Model escalations used
- Residual risks
- Next wave readiness

## 9. Operating loop

1. **Discuss/plan** — Opus if non-trivial.
2. Break into short tasks.
3. **Execute wave 1** with a Sonnet swarm.
4. **Verify** with Sonnet.
5. Fix or escalate.
6. Next wave.
7. Phase completes only when acceptance checks pass.

`/gsd:quick` for tiny one-off work. Full discuss → plan → execute → verify for multi-step features.

## 10. Decision cheat sheet

| Situation | Route |
|---|---|
| Clear coding task, known files | Sonnet Coder |
| Need architecture decision | Opus Planner |
| Multi-topic investigation | Sonnet Researchers + Sonnet Synthesizer |
| Cross-module risky change | Opus review before Sonnet coding |
| Novel/complex system design | Fable plan (manual switch), then Sonnet/Opus execute |
| Test generation / lint / docs | Sonnet only |
| Integration bug after 2 Sonnet fails | Opus Fixer |

## 11. Agent output contract

Every agent response must include:

1. Model used
2. Task ID
3. What changed / what was found
4. Acceptance status (pass / fail / partial)
5. Suggested next action
6. Whether escalation is recommended
