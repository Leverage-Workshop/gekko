# Plan With Codex

You are the lead architect for this task. Codex is an independent engineering reviewer.

The user's task is:

$ARGUMENTS

Do not modify production code during this command. Your goal is to produce a high-confidence implementation plan.

## Phase 1: Understand the task

1. Read the relevant repository files.
2. Trace the existing implementation far enough to understand:

   * current architecture
   * relevant data flow
   * existing abstractions
   * nearby patterns that should probably be reused
3. Identify any important assumptions or ambiguous requirements.
4. Do not design the solution until you understand the existing code.

## Phase 2: Create your independent plan

Develop your own implementation approach before consulting Codex.

Consider:

* simplest viable architecture
* files and components likely to change
* interfaces or APIs affected
* persistence/data-model implications
* state-management implications
* error and recovery paths
* backward compatibility
* test strategy
* migration or rollout concerns

Keep this plan internal for now. Do not give it to Codex yet.

## Phase 3: Ask Codex for an independent analysis

Use the Codex MCP tool.

Give Codex:

* the user's requirements
* relevant repository context
* relevant file paths
* architectural constraints you discovered

Do NOT give Codex your proposed solution.

Ask Codex to independently:

1. explain how it understands the existing implementation
2. propose an implementation architecture
3. identify files/components that should change
4. identify edge cases and failure modes
5. identify testing requirements
6. identify anything in the request that may be unnecessary or overengineered

## Phase 4: Compare the plans

Compare your approach with Codex's.

Explicitly identify:

* areas of agreement
* architectural disagreements
* assumptions that differ
* things Claude noticed that Codex missed
* things Codex noticed that Claude missed
* unnecessary complexity in either proposal
* risks introduced by either design

Do not assume your original approach is correct.

## Phase 5: Adversarial Codex review

Now give Codex your preferred combined approach.

Ask Codex to act as a skeptical senior engineer and try to break the design.

Specifically ask it to look for:

* misunderstood requirements
* simpler alternatives
* incorrect assumptions about the existing code
* poor abstraction boundaries
* unnecessary new abstractions
* coupling problems
* race conditions
* state consistency problems
* concurrency issues
* error-handling gaps
* migration/data-loss risks
* security implications
* performance problems
* difficult-to-test behavior
* missing edge cases

Codex should criticize the plan rather than rewrite it from scratch.

## Phase 6: Resolve disagreements

Evaluate Codex's objections using the actual repository as evidence.

Where necessary:

* inspect additional code
* verify assumptions
* reject objections that do not apply
* incorporate objections that materially improve the design

Do not blindly accept Codex suggestions.

## Phase 7: Produce the final plan

Present the user with a concise final implementation plan containing:

### Goal

What we're changing and why.

### Existing behavior

How the relevant system works today.

### Proposed approach

The chosen architecture and why it is preferable.

### Implementation steps

A numbered sequence of concrete implementation tasks.

For each step include:

* file(s) likely affected
* intended change
* dependencies on previous steps

### Tests

What should be tested and at what level.

### Risks / edge cases

Important failure modes or implementation risks.

### Open questions

Only include questions that genuinely cannot be resolved from the repository.

### Claude / Codex review notes

Briefly mention any material disagreement between the two analyses and how it was resolved.

Do not implement the plan unless the user explicitly asks you to proceed.
