# Tinge Evaluation Infrastructure Implementation Plan

## Overview
This plan implements persona-based multi-turn conversation testing for the Tinge tutoring system using the Inspect AI framework. The goal is to systematically evaluate tutoring quality across diverse user personas and conversation lengths.

## Architecture
```
Research Traits → Persona Generator → Multi-turn Simulator → LLM Tutor → LLM Judge → Dashboard Analytics
```

## Directory Structure
```
tinge/
├── evaluation/                    # New evaluation infrastructure
│   ├── __init__.py
│   ├── config/
│   │   ├── personas.yaml         # Persona definitions
│   │   ├── quality_criteria.yaml # Evaluation criteria
│   │   └── models.yaml           # Model configurations
│   ├── core/
│   │   ├── __init__.py
│   │   ├── personas.py           # Persona generation logic
│   │   ├── simulator.py          # Multi-turn conversation simulator
│   │   ├── evaluator.py          # LLM-as-a-judge implementation
│   │   └── tutoring_wrapper.py   # Text interface to tutoring system
│   ├── tasks/
│   │   ├── __init__.py
│   │   └── tutoring_eval.py      # Main Inspect task definitions
│   ├── dashboard/
│   │   ├── __init__.py
│   │   ├── app.py                # Streamlit dashboard
│   │   ├── components/           # Dashboard components
│   │   └── utils.py              # Dashboard utilities
│   ├── scripts/
│   │   ├── run_evaluation.py     # CLI for running evaluations
│   │   ├── generate_personas.py  # Persona generation script
│   │   └── export_results.py     # Results export utilities
│   └── tests/
│       ├── test_personas.py
│       ├── test_simulator.py
│       └── test_evaluator.py
├── logs/                         # Inspect evaluation logs
└── requirements-eval.txt         # Additional evaluation dependencies
```

## Implementation Plan (7 Days)

### Day 1-2: Core Infrastructure Setup

#### 1. Install Dependencies
```bash
pip install inspect-ai streamlit pydantic pyyaml
pip freeze > requirements-eval.txt
```

#### 2. Create Tutoring System Text Wrapper
**File: `evaluation/core/tutoring_wrapper.py`**
- Create text-based interface to your tutoring backend
- Bypass audio pipeline, use transcription logic
- Implement conversation state management
- Add logging for debugging

```python
class TutoringSystemWrapper:
    """Text-based interface to Tinge tutoring system for evaluation"""
    
    async def start_session(self, learning_goal: str) -> str:
        """Start new tutoring session"""
        pass
    
    async def get_response(self, user_message: str, session_context: dict) -> str:
        """Get tutoring response to user message"""
        pass
    
    async def end_session(self, session_id: str) -> dict:
        """End session and return summary"""
        pass
```

#### 3. Define Persona Data Models
**File: `evaluation/core/personas.py`**
- Create Pydantic models for persona metadata
- Implement persona behavior generation
- Add sampling algorithms for coverage

### Day 3-4: Persona Generation and Simulation

#### 4. Research-Based Persona Generation
**File: `evaluation/config/personas.yaml`**
- Define learning-relevant traits (motivation, frustration_tolerance, etc.)
- Create persona templates based on SLA research
- Implement back-translation to LLM-readable descriptions

#### 5. Multi-Turn Conversation Simulator  
**File: `evaluation/core/simulator.py`**
- Implement Inspect custom solver for conversation simulation
- Handle persona-based user behavior across turns
- Manage conversation state and termination conditions

```python
@solver
def persona_conversation_simulator(max_turns: int = 10):
    """Simulate multi-turn conversation with persona-based user behavior"""
    async def solve(state: TaskState, generate: Generate):
        # Implementation here
        return state
    return solve
```

### Day 5: LLM Judge Implementation

#### 6. Quality Criteria Definition
**File: `evaluation/config/quality_criteria.yaml`**
- Define evaluation dimensions (topic adherence, difficulty calibration, socratic method, etc.)
- Create rubrics for each quality dimension
- Implement scoring templates

#### 7. LLM-as-a-Judge Scorer
**File: `evaluation/core/evaluator.py`**
- Implement custom Inspect scorer for tutoring quality
- Multi-dimensional evaluation (separate scores per criteria)
- Aggregate scoring with confidence measures

### Day 6: Dashboard and Visualization

#### 8. Streamlit Dashboard
**File: `evaluation/dashboard/app.py`**
- Overview page: Quality trends across personas/time
- Detailed view: Individual conversations with ratings
- Filtering by persona characteristics and quality dimensions
- Real-time evaluation monitoring

#### 9. Dashboard Components
- Quality time-series charts
- Persona performance heatmaps  
- Conversation drill-down with color-coded ratings
- Export functionality for results

### Day 7: Integration and Testing

#### 10. Main Evaluation Task
**File: `evaluation/tasks/tutoring_eval.py`**
- Combine all components into Inspect task
- Configuration management
- Error handling and logging

#### 11. CLI Scripts
**File: `evaluation/scripts/run_evaluation.py`**
- Command-line interface for running evaluations
- Configuration options and parameter sweeps
- Integration with CI/CD pipelines

## Key Files to Implement

### 1. Main Evaluation Task (`evaluation/tasks/tutoring_eval.py`)
```python
from inspect_ai import Task, task
from inspect_ai.scorer import model_graded_fact
from ..core.personas import PersonaDataset, PersonaMetadata  
from ..core.simulator import persona_conversation_simulator
from ..core.evaluator import tutoring_quality_scorer

@task
def tutoring_evaluation(
    personas_file: str = "evaluation/config/personas.yaml",
    max_turns: int = 10,
    num_conversations: int = 50
):
    """Main evaluation task for tutoring system"""
    return Task(
        dataset=PersonaDataset.from_config(personas_file, num_conversations),
        solver=persona_conversation_simulator(max_turns=max_turns),
        scorer=tutoring_quality_scorer(),
        metadata={"evaluation_type": "persona_based", "max_turns": max_turns}
    )
```

### 2. Persona Configuration (`evaluation/config/personas.yaml`)
```yaml
traits:
  motivation:
    - name: "intrinsic_high" 
      description: "Highly self-motivated, enjoys learning for its own sake"
      weight: 0.3
    - name: "extrinsic_low"
      description: "Needs external motivation, easily discouraged"
      weight: 0.2
  
  frustration_tolerance:
    - name: "high_tolerance"
      description: "Patient with mistakes, willing to retry multiple times"
      weight: 0.4
    - name: "low_tolerance" 
      description: "Gets frustrated quickly, may give up after few mistakes"
      weight: 0.3

personas:
  - id: "eager_learner"
    traits: {motivation: "intrinsic_high", frustration_tolerance: "high_tolerance"}
    behavior_prompt: "You are an enthusiastic language learner who..."
    
  - id: "struggling_student"  
    traits: {motivation: "extrinsic_low", frustration_tolerance: "low_tolerance"}
    behavior_prompt: "You are someone who finds language learning challenging..."
```

### 3. Quality Criteria (`evaluation/config/quality_criteria.yaml`)
```yaml
criteria:
  topic_adherence:
    weight: 0.25
    description: "Stays focused on learning goals throughout conversation"
    rubric: "evaluation/prompts/topic_adherence_rubric.txt"
    
  difficulty_calibration:
    weight: 0.25  
    description: "Adjusts difficulty appropriately based on user responses"
    rubric: "evaluation/prompts/difficulty_rubric.txt"
    
  socratic_method:
    weight: 0.25
    description: "Guides learning without giving direct answers"
    rubric: "evaluation/prompts/socratic_rubric.txt"
    
  emotional_support:
    weight: 0.25
    description: "Provides appropriate encouragement and handles frustration"  
    rubric: "evaluation/prompts/emotional_support_rubric.txt"
```

## CI/CD Integration Strategy

### GitHub Actions Workflow (`.github/workflows/evaluation.yml`)
```yaml
name: Tutoring System Evaluation

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * 1'  # Weekly Monday 2AM

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install -r requirements-eval.txt
      - name: Run evaluation
        run: |
          python evaluation/scripts/run_evaluation.py --config evaluation/config/ci_config.yaml
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: evaluation-results
          path: logs/
```

## Testing Strategy

### Unit Tests
- Test persona generation logic
- Test conversation simulation
- Test quality evaluation components
- Mock tutoring system responses

### Integration Tests  
- End-to-end evaluation pipeline
- Dashboard functionality
- Export/import of results

### Performance Tests
- Evaluation speed benchmarks
- Memory usage monitoring
- Cost tracking for LLM calls

## Future Enhancements

### Phase 2: Audio Integration (Strategy 2)
- Headless browser automation with Selenium
- Speech synthesis for persona voices
- Audio quality evaluation metrics

### Phase 3: Advanced Analytics
- A/B testing framework for tutoring improvements
- Longitudinal user journey analysis
- Predictive modeling for learning outcomes

### Phase 4: Production Monitoring
- Real-time evaluation of live conversations
- Alerting for quality degradation
- Continuous learning from user feedback

## Success Metrics

### For Talk (Week 1)
- ✅ Working persona-based evaluation
- ✅ 1-2 concrete examples of issues found
- ✅ Dashboard showing quality trends
- ✅ Clear architecture diagram

### For Production (Month 1)
- ✅ Automated CI/CD evaluation pipeline  
- ✅ Quality regression detection
- ✅ Regular evaluation reports
- ✅ Integration with monitoring systems

## Getting Started

1. **Clone and setup:**
   ```bash
   git clone https://github.com/lukashondrich/tinge
   cd tinge
   pip install -r requirements-eval.txt
   ```

2. **Create initial configuration:**
   ```bash
   mkdir -p evaluation/config
   # Copy template configs and customize
   ```

3. **Implement tutoring wrapper:**
   ```bash
   # Start with evaluation/core/tutoring_wrapper.py
   # Create text interface to existing backend
   ```

4. **Run first evaluation:**
   ```bash
   python evaluation/scripts/run_evaluation.py --test-mode
   ```

5. **Launch dashboard:**
   ```bash
   streamlit run evaluation/dashboard/app.py
   ```

## Questions for Implementation

1. **Backend Access:** What's the best way to call your tutoring logic directly (API endpoint, direct function calls, etc.)?

2. **Session Management:** How does your system currently manage conversation state and context?

3. **Quality Metrics:** Are there specific tutoring failures you've observed that we should prioritize testing?

4. **Resource Constraints:** What's your preferred LLM for evaluation (cost vs. quality trade-offs)?

This plan balances the 1-week deadline for your talk with a solid foundation for long-term evaluation infrastructure. Start with the core components and expand based on your specific needs and findings.