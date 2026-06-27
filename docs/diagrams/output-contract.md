# Output Contract (Zod)

Source: `docs/agent-architecture-plan.md` → *Output contract* (lines 190–217) and
`knowledge/schema/briefing.schema.ts` (feat-006, **done**). The Zod schema is the single
source of truth for both task outputs; the Next.js UI renders tables and the terrain map
straight from these objects.

```mermaid
classDiagram
  class Briefing {
    +Meta meta
    +Overview overview
    +Terrain terrain
    +Objective primary
    +Objective secondary
    +DangerZone[] dangerZones
  }
  class Meta {
    +Date createdAt
    +string triggerReason
    +number currentPrice
    +string htfTrend
    +string ripStatus
  }
  class Overview {
    +string[] currentPosition
    +string[] structuralArchitecture
    +string[] orderFlowContext
    +KeyInflection[] keyInflections
  }
  class KeyInflection {
    +number level
    +string why
  }
  class Terrain {
    +Zone[] zones
    +Level[] levels
  }
  class Zone {
    +string color
    +number top
    +number bottom
    +string label
  }
  class Level {
    +number price
    +string label
    +LevelKind kind
  }
  class Objective {
    +string macroGoal
    +string rationale
    +Direction direction
    +Entry[] entries
    +Stop[] stops
    +Target[] targets
    +number rr
  }
  class DangerZone {
    +string area
    +string why
  }
  class EvalResult {
    +EvalMeta meta
    +EvalStatus status
    +EvalLevel evaluatedLevel
    +Direction direction
    +string trigger
    +number stop
    +number[] targets
    +string reason
  }

  Briefing *-- Meta
  Briefing *-- Overview
  Overview *-- KeyInflection
  Briefing *-- Terrain
  Briefing *-- Objective
  Briefing *-- DangerZone
  Terrain *-- Zone
  Terrain *-- Level

  note for Level "LevelKind = trench | wall | magnet | mgi"
  note for Objective "Direction = long | short; Target label = T1 | T2 | T3; rr from riskReward.ts"
  note for EvalResult "EvalStatus = ENTER | WAIT | NOT_VALID | NO_ENTRY_NEAR (lighter contract from eval-task)"
```
