Transparent Tutoring Module — Implementation Plan

## Context & Motivation

This plan describes a new feature for an existing real-time voice-to-voice language tutoring application. The app currently uses OpenAI's Realtime Voice API for conversation, Elasticsearch/Haystack for RAG over ~10,000 Wikipedia articles about Latin America and Spain, a Three.js-based 3D point cloud visualization of embedded vocabulary, and a chat-style UI (speech bubbles) overlaying the point cloud. The tutor has agentic memory (stored in browser storage) tracking vocabulary, user interests, and learning style.

The goal of this module is to add **verifiable, transparent corrections** — when the tutor corrects a learner's language use, the correction should be inspectable and challengeable by the learner. This implements the principle of "verifiability as a minimal requirement for human oversight" (Hondrich & Ruschemeier, 2023) in a practical educational product.

### Why This Matters

The OpenAI Realtime API model does not produce reasoning traces, and even models that do produce chain-of-thought are not always faithful in their reasoning (see Anthropic's "Reasoning Models Don't Always Say What They Think," 2025). Therefore, rather than trying to expose the model's internal reasoning, we build an **independent verification layer** — a separate system that analyzes corrections after they're made and provides structured, checkable explanations.

---

## Architecture Overview

The system has three new components:

1. **Correction Detector** — Analyzes the conversation transcript to identify when the tutor has made a correction
2. **Verification Service** — Takes a detected correction and produces a structured breakdown (what was wrong, what it should be, and why)
3. **Frontend Correction UI** — Displays correction indicators on speech bubbles with expandable breakdowns

### Data Flow

```
User speaks → OpenAI Realtime API → Tutor responds (may include correction)
                                          ↓
                                   Transcript updated in UI (speech bubble)
                                          ↓
                              Correction Detector analyzes the exchange
                              (runs on each tutor response)
                                          ↓
                              If correction detected:
                                → Verification Service (async API call to GPT-4o or Claude)
                                → Returns structured correction object
                                → Frontend renders indicator on speech bubble
                                → User can tap to expand breakdown
```

### Important Design Decisions

- The verification call is **asynchronous and non-blocking**. The voice conversation continues uninterrupted. The correction breakdown appears in the UI when ready (typically <2 seconds after the tutor speaks).
- The verification model is a **separate, non-realtime model call** (e.g., GPT-4o, Claude Sonnet). This is intentional — it provides an independent check rather than asking the same model to explain itself.
- Corrections are presented using **progressive disclosure**: minimal indicator during conversation, full breakdown on demand.

---

## Component 1: Correction Detector

### What It Does

After each tutor response, analyze the pair (user's last utterance, tutor's response) to determine if a correction was made. The tutor already naturally corrects the user as part of the conversation (e.g., "By the way, instead of 'tengo hambre mucho,' you'd say 'tengo mucha hambre'"). The detector needs to recognize these corrections and extract the relevant parts.

### Approach

- After each tutor message is finalized in the transcript, send the (user_message, tutor_response) pair to a lightweight classification call
- The call should return either `null` (no correction) or a list of corrections, each with:
  - `original`: what the user said (extracted quote)
  - `corrected`: what the tutor suggested instead
  - `correction_type`: one of `vocabulary`, `grammar`, `pronunciation`, `style/register`
- This can be a structured output / function call to a fast model (GPT-4o-mini is fine here — it's just extraction, not generation)
- Alternatively, this could be done with prompting on the Realtime API itself using a function call / tool definition that the tutor can invoke when it makes a correction. This would be simpler and lower-latency, but couples the detection to the tutoring model. Either approach works — try the function call approach first since it's simpler.

### Preferred Approach: Tutor-Side Function Call

Define a tool/function in the Realtime API session that the tutor can call when it makes a correction:

```json
{
  "name": "log_correction",
  "description": "Call this whenever you correct the learner's language use. Log each distinct correction separately.",
  "parameters": {
    "original": "What the learner said (exact quote)",
    "corrected": "The correct form",
    "correction_type": "vocabulary | grammar | pronunciation | style"
  }
}
```

This way the correction detection is zero-latency — it happens as part of the tutor's response. The function call triggers the verification service.

---

## Component 2: Verification Service

### What It Does

Takes a detected correction and produces a structured, human-readable explanation that the learner can use to verify whether the correction is accurate.

### Input

```json
{
  "original": "tengo hambre mucho",
  "corrected": "tengo mucha hambre",
  "correction_type": "grammar",
  "conversation_context": "last 2-3 exchanges for context",
  "learner_level": "from agentic memory"
}
```

### Output

```json
{
  "mistake": "tengo hambre mucho",
  "correction": "tengo mucha hambre",
  "rule": "In Spanish, 'mucho/mucha' must agree in gender with the noun it modifies and is placed before the noun. 'Hambre' is feminine despite starting with 'a', so it takes 'mucha'. The adjective precedes the noun: 'mucha hambre', not 'hambre mucho'.",
  "confidence": 0.95,
  "category": "adjective-noun agreement + word order"
}
```

### Implementation Notes

- This is a standard async API call to a capable model (GPT-4o or Claude Sonnet)
- The prompt should instruct the model to:
  - Explain the rule clearly and concisely, adapted to the learner's proficiency level
  - Be honest about ambiguous cases (e.g., regional variations where both forms might be acceptable)
  - Provide a confidence score — lower confidence for cases where the "correction" might actually be a valid alternative
  - Keep explanations short (2-3 sentences max)
- The service should be a simple Python endpoint (FastAPI) or could be a serverless function
- Responses should be cached by (original, corrected) pair to avoid redundant API calls for repeated mistakes

---

## Component 3: Frontend Correction UI

### Design Principles

- **Progressive disclosure**: Correction appears minimally during conversation, expandable on demand
- **Non-disruptive**: Never interrupts the voice conversation flow
- **Integrated**: Lives within the existing speech bubble UI, not a separate panel

### Interaction Flow

1. Tutor makes a correction in conversation. The speech bubble appears as normal.
2. A subtle visual indicator appears on that speech bubble — a small icon or badge (e.g., a small lightbulb, or a text label like "correction" in a muted color) in the corner of the bubble. This signals "this message contains a correction you can explore."
3. User taps the indicator (or taps a "Show breakdown" button/link).
4. Below the speech bubble, an expandable card slides open showing:
   - **Your phrase**: the original (what the user said), displayed in a distinct color (e.g., muted red/orange)
   - **Correction**: the corrected form, displayed in another color (e.g., green)
   - **Rule**: the explanation from the verification service
   - **A "Was this helpful?" or "Do you agree?" interaction** — thumbs up/down, or a simple "This was wrong" button
5. User can collapse the card and continue the conversation.

### Disagreement Handling

When a user marks a correction as wrong:
- Store this feedback alongside the correction record
- Optionally, trigger a follow-up verification call with a different model or additional context to double-check
- Over time, this feedback data can be used to improve the tutor's correction prompting (e.g., "avoid correcting regional variations")
- Surface patterns to the user: "You've flagged 3 corrections about vosotros usage — would you like the tutor to accept vosotros forms?"

### Data Storage

Correction records should be stored in the existing agentic memory system (browser storage), structured as:

```json
{
  "corrections": [
    {
      "timestamp": "2026-02-15T14:30:00Z",
      "session_id": "...",
      "original": "tengo hambre mucho",
      "corrected": "tengo mucha hambre",
      "correction_type": "grammar",
      "rule": "...",
      "confidence": 0.95,
      "category": "adjective-noun agreement + word order",
      "user_feedback": null
    }
  ]
}
```

This data enables future features:
- Correction history review (post-session)
- Error pattern analysis ("you most commonly struggle with X")
- Adaptive tutoring (focus on areas with most corrections)
- The grammar visualization feature (planned for later — a structured view of grammar concepts the learner is working on)

---

## Implementation Order

### Phase 1: Correction Detection via Function Call
- Add the `log_correction` tool definition to the Realtime API session configuration
- Update the tutor's system prompt to instruct it to call `log_correction` whenever it corrects the user
- Handle the function call on the backend and forward the correction data to the frontend via the existing WebRTC/WebSocket connection
- Test that corrections are reliably detected without disrupting conversation flow

### Phase 2: Verification Service
- Create a new endpoint (or service function) that takes a correction and returns a structured explanation
- Implement the prompt for generating explanations
- Add caching for repeated (original, corrected) pairs
- Connect to Phase 1: when a correction is detected, fire the verification call async

### Phase 3: Frontend UI
- Add the correction indicator to speech bubbles that contain corrections
- Build the expandable correction card component (your phrase / correction / rule)
- Add the "Show breakdown" interaction
- Add the "Do you agree?" feedback interaction
- Store correction records in browser storage alongside existing agentic memory

### Phase 4: Polish & Iterate
- Tune the tutor's system prompt so it calls `log_correction` reliably but not excessively
- Adjust the verification prompt for explanation quality and appropriate detail level
- Test with real conversations and refine the UI based on how it feels during actual voice sessions
- Add correction data to the agentic memory so the tutor can reference past corrections ("Remember last time we talked about mucho vs mucha?")

---

## Future Extensions (Out of Scope for v1)

- **Grammar visualization**: A structured view (tree/graph) of grammar concepts, powered by accumulated correction data. Swipeable from the vocabulary point cloud.
- **Correction trails in the point cloud**: For vocabulary-type corrections, show visual links between confused words in the embedding space.
- **Post-session review**: A summary view of all corrections from a session, reviewable after the conversation ends.
- **Cross-session error patterns**: "Over the last 5 sessions, your most common mistake category is subjunctive triggers."