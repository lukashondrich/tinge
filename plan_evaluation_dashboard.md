# Tinge Evaluation Dashboard Implementation Plan

## Overview
Implementation plan for a two-page Streamlit dashboard to visualize tutoring system evaluation results from Inspect AI logs.

## Dashboard Structure

### Directory Layout
```
tinge/
├── evaluation/
│   ├── dashboard/
│   │   ├── app.py                 # Main Streamlit app
│   │   ├── pages/
│   │   │   ├── __init__.py
│   │   │   ├── overview.py        # Page 1: Aggregate metrics
│   │   │   └── conversation.py    # Page 2: Detailed conversation view
│   │   ├── components/
│   │   │   ├── __init__.py
│   │   │   ├── data_loader.py     # Load and parse Inspect logs
│   │   │   ├── metrics_chart.py   # Chart components for overview
│   │   │   └── chat_interface.py  # Chat bubble components
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── log_parser.py      # Parse Inspect AI log files
│   │       └── quality_scorer.py  # Quality metric calculations
```

## Page Specifications

### Page 1: Overview (Aggregate Metrics)
**Purpose:** High-level view of quality trends across multiple conversations

**Components:**
- **Conversation Selector:** Multi-select dropdown with conversation IDs
- **Quality Metric Selector:** Single-select dropdown for metric type
- **Time-Series Chart:** Line chart showing quality over conversation turns
- **Summary Statistics:** Basic stats for selected conversations

**Layout:**
```
[Page Title: "Evaluation Overview"]

[Filters Row]
┌─────────────────────┬─────────────────────┐
│ Select Conversations│ Select Quality      │
│ [Multi-Select ▼]    │ Metric [Single ▼]   │
└─────────────────────┴─────────────────────┘

[Main Chart Area]
┌─────────────────────────────────────────────┐
│          Quality Over Time                  │
│  Quality ↑                                  │
│         │ ∿∿∿ Conv 1                       │
│         │   ∿∿ Conv 2                      │
│         │     ∿ Conv 3                     │
│         └────────────────→ Turn Number     │
└─────────────────────────────────────────────┘

[Summary Table]
┌─────────────────────────────────────────────┐
│ Conversation ID │ Avg Quality │ # Turns    │
│ conv_001        │ 0.78        │ 12         │
│ conv_002        │ 0.65        │ 8          │
└─────────────────────────────────────────────┘
```

### Page 2: Conversation Details
**Purpose:** Turn-by-turn analysis of individual conversations

**Components:**
- **Conversation Selector:** Single-select dropdown with conversation IDs
- **Quality Metric Selector:** Single-select dropdown for metric display
- **Chat Interface:** Speech bubbles with quality scores
- **Metric Details:** Expandable reasoning for quality scores

**Layout:**
```
[Page Title: "Conversation Analysis"]

[Filters Row]
┌─────────────────────┬─────────────────────┐
│ Select Conversation │ Quality Metric      │
│ [Single Select ▼]   │ [Single Select ▼]   │
└─────────────────────┴─────────────────────┘

[Chat Interface]
┌─────┬─────────────────────────────────┬─────┐
│0.85 │ ┌─────────────────────────────┐ │     │
│[📊] │ │ Hi, I want to learn Spanish │ │     │ ← User
│     │ └─────────────────────────────┘ │     │
│     │                                 │     │
│     │ ┌─────────────────────────────┐ │0.72 │
│     │ │ Great! Let's start with     │ │[📊] │ ← Assistant  
│     │ │ basic greetings...          │ │     │
│     │ └─────────────────────────────┘ │     │
└─────┴─────────────────────────────────┴─────┘
        ↑ Color-coded by quality score
```

**Color Coding:**
- 🟢 Green: Quality ≥ 0.7 (Good)
- 🟠 Orange: Quality 0.4-0.69 (Needs Improvement)  
- 🔴 Red: Quality < 0.4 (Poor)

## Implementation Plan (5 Days)

### Day 1: Core Infrastructure
**Files to create:**
- `evaluation/dashboard/app.py` - Main Streamlit app
- `evaluation/dashboard/utils/log_parser.py` - Parse Inspect logs
- `evaluation/dashboard/components/data_loader.py` - Data loading logic

**Tasks:**
1. **Setup Streamlit app structure**
   ```python
   import streamlit as st
   from pages import overview, conversation
   
   st.set_page_config(
       page_title="Tinge Evaluation Dashboard",
       page_icon="📊",
       layout="wide"
   )
   
   # Sidebar navigation
   page = st.sidebar.selectbox("Navigation", ["Overview", "Conversation Details"])
   
   if page == "Overview":
       overview.render()
   elif page == "Conversation Details":
       conversation.render()
   ```

2. **Implement log parser**
   ```python
   def parse_inspect_logs(log_directory: str) -> Dict[str, Any]:
       """Parse Inspect AI log files into structured data"""
       # Read JSON log files
       # Extract conversation data, quality metrics, metadata
       # Return structured dictionary
   ```

3. **Basic data loading**
   ```python
   @st.cache_data
   def load_evaluation_data():
       """Load and cache evaluation data from logs"""
       return parse_inspect_logs("logs/")
   ```

### Day 2: Overview Page
**Files to create:**
- `evaluation/dashboard/pages/overview.py` - Overview page implementation
- `evaluation/dashboard/components/metrics_chart.py` - Chart components

**Tasks:**
1. **Implement conversation selector**
   ```python
   def render():
       st.title("📊 Evaluation Overview")
       
       # Load data
       data = load_evaluation_data()
       conversation_ids = list(data.keys())
       
       # Filters
       col1, col2 = st.columns(2)
       with col1:
           selected_conversations = st.multiselect(
               "Select Conversations",
               conversation_ids,
               default=conversation_ids[:3]  # Select first 3 by default
           )
       
       with col2:
           available_metrics = ["topic_adherence", "difficulty_calibration", "socratic_method", "emotional_support"]
           selected_metric = st.selectbox("Quality Metric", available_metrics)
   ```

2. **Implement time-series chart**
   ```python
   def create_quality_chart(conversations: List[str], metric: str) -> Dict:
       """Create time-series chart data for selected conversations and metric"""
       chart_data = {}
       
       for conv_id in conversations:
           conversation = data[conv_id]
           turns = []
           scores = []
           
           for turn_idx, turn in enumerate(conversation['turns']):
               turns.append(turn_idx)
               scores.append(turn['metrics'][metric])
           
           chart_data[conv_id] = pd.DataFrame({
               'turn': turns,
               'quality': scores
           })
       
       return chart_data
   ```

3. **Add summary statistics table**

### Day 3: Conversation Page Foundation
**Files to create:**
- `evaluation/dashboard/pages/conversation.py` - Conversation page implementation
- `evaluation/dashboard/components/chat_interface.py` - Chat bubble components

**Tasks:**
1. **Conversation selector and basic layout**
   ```python
   def render():
       st.title("💬 Conversation Analysis")
       
       # Load data
       data = load_evaluation_data()
       
       # Filters
       col1, col2 = st.columns(2)
       with col1:
           conversation_id = st.selectbox("Select Conversation", list(data.keys()))
       
       with col2:
           available_metrics = ["topic_adherence", "difficulty_calibration", "socratic_method", "emotional_support"]
           selected_metric = st.selectbox("Quality Metric", available_metrics)
       
       # Display conversation
       if conversation_id:
           display_conversation(data[conversation_id], selected_metric)
   ```

2. **Basic chat interface without styling**
   ```python
   def display_conversation(conversation: Dict, metric: str):
       """Display conversation in chat format"""
       st.markdown("### Conversation Flow")
       
       for turn_idx, turn in enumerate(conversation['turns']):
           col1, col2, col3 = st.columns([1, 6, 1])
           
           with col2:
               # User message
               with st.chat_message("user"):
                   st.write(turn['user_message'])
               
               # Assistant message
               with st.chat_message("assistant"):
                   st.write(turn['assistant_message'])
           
           # Quality scores on sides (basic)
           with col1:
               st.metric("Turn Quality", f"{turn['metrics'][metric]:.2f}")
   ```

### Day 4: Enhanced Chat Interface
**Tasks:**
1. **Implement color-coded speech bubbles**
   ```python
   def get_quality_color(score: float) -> str:
       """Return color based on quality score"""
       if score >= 0.7:
           return "🟢"  # Green
       elif score >= 0.4:
           return "🟠"  # Orange
       else:
           return "🔴"  # Red
   
   def get_quality_style(score: float) -> str:
       """Return CSS style for quality score"""
       if score >= 0.7:
           return "background-color: #d4edda; border-left: 4px solid #28a745;"
       elif score >= 0.4:
           return "background-color: #fff3cd; border-left: 4px solid #ffc107;"
       else:
           return "background-color: #f8d7da; border-left: 4px solid #dc3545;"
   ```

2. **Enhanced message display with styling**
   ```python
   def display_message(message: str, role: str, quality_score: float, metric: str):
       """Display message with quality-based styling"""
       color_indicator = get_quality_color(quality_score)
       style = get_quality_style(quality_score)
       
       with st.container():
           st.markdown(
               f"""
               <div style="{style} padding: 10px; margin: 5px 0; border-radius: 5px;">
                   <strong>{role.title()}:</strong> {message}
                   <br><small>{color_indicator} {metric}: {quality_score:.2f}</small>
               </div>
               """,
               unsafe_allow_html=True
           )
   ```

### Day 5: Expandable Metric Details
**Tasks:**
1. **Implement expandable metric details**
   ```python
   def display_metric_details(turn_metrics: Dict, turn_idx: int):
       """Display expandable metric details with reasoning"""
       with st.expander(f"📊 Turn {turn_idx + 1} - Detailed Metrics"):
           for metric_name, score in turn_metrics.items():
               col1, col2 = st.columns([1, 2])
               
               with col1:
                   st.metric(metric_name.replace('_', ' ').title(), f"{score:.2f}")
               
               with col2:
                   # Show reasoning if available
                   reasoning = turn_metrics.get(f"{metric_name}_reasoning", "No reasoning available")
                   st.write(f"**Reasoning:** {reasoning}")
   ```

2. **Integration and final polish**
   ```python
   def display_conversation_enhanced(conversation: Dict, selected_metric: str):
       """Enhanced conversation display with all features"""
       for turn_idx, turn in enumerate(conversation['turns']):
           # Main message area
           col1, col2, col3 = st.columns([1, 8, 1])
           
           with col2:
               # User message with quality styling
               user_quality = turn['metrics'].get('user_engagement', 0.8)  # Default score
               display_message(turn['user_message'], "user", user_quality, "engagement")
               
               # Assistant message with quality styling  
               assistant_quality = turn['metrics'][selected_metric]
               display_message(turn['assistant_message'], "assistant", assistant_quality, selected_metric)
           
           # Quality metric on side
           with col3:
               st.metric(
                   f"{selected_metric.replace('_', ' ').title()}", 
                   f"{assistant_quality:.2f}"
               )
           
           # Expandable details
           display_metric_details(turn['metrics'], turn_idx)
           
           st.markdown("---")  # Separator between turns
   ```

## Data Structure Requirements

### Expected Log Structure
```json
{
  "conversation_id_001": {
    "metadata": {
      "persona": "eager_learner",
      "learning_goal": "Spanish basics",
      "start_time": "2024-01-15T10:00:00",
      "duration_minutes": 12
    },
    "turns": [
      {
        "turn_number": 1,
        "user_message": "Hi, I want to learn Spanish",
        "assistant_message": "Great! Let's start with basic greetings...",
        "metrics": {
          "topic_adherence": 0.85,
          "difficulty_calibration": 0.78,
          "socratic_method": 0.72,
          "emotional_support": 0.88,
          "topic_adherence_reasoning": "Tutor correctly identified learning goal and stayed on topic",
          "difficulty_calibration_reasoning": "Appropriate starting difficulty for beginner"
        }
      }
    ]
  }
}
```

## Development Commands

### Setup
```bash
# Install dependencies
pip install streamlit plotly pandas

# Create directory structure
mkdir -p evaluation/dashboard/{pages,components,utils}
touch evaluation/dashboard/{__init__.py,app.py}
touch evaluation/dashboard/pages/{__init__.py,overview.py,conversation.py}
touch evaluation/dashboard/components/{__init__.py,data_loader.py,metrics_chart.py,chat_interface.py}
touch evaluation/dashboard/utils/{__init__.py,log_parser.py,quality_scorer.py}
```

### Launch Dashboard
```bash
# From tinge repo root
streamlit run evaluation/dashboard/app.py
```

### Development Mode
```bash
# Auto-reload on file changes
streamlit run evaluation/dashboard/app.py --server.runOnSave true
```

## Testing Strategy

### Mock Data for Development
Create `evaluation/dashboard/utils/mock_data.py`:
```python
def generate_mock_data() -> Dict[str, Any]:
    """Generate mock conversation data for development"""
    return {
        "conv_001": {
            "metadata": {"persona": "eager_learner"},
            "turns": [
                {
                    "turn_number": 1,
                    "user_message": "Hello, I want to learn Spanish",
                    "assistant_message": "¡Hola! Let's start with basic greetings.",
                    "metrics": {
                        "topic_adherence": 0.85,
                        "difficulty_calibration": 0.78,
                        "socratic_method": 0.72,
                        "emotional_support": 0.88
                    }
                }
                # ... more turns
            ]
        }
        # ... more conversations
    }
```

### Integration Testing
1. **Test with real Inspect logs** once evaluation pipeline is ready
2. **Verify color coding** works correctly for different quality scores
3. **Test performance** with large conversation datasets
4. **Validate metric calculations** match expected values

## Success Criteria

### Week 1 (Talk Ready)
- ✅ Both pages functional with basic features
- ✅ Can load and display mock conversation data
- ✅ Color-coded chat interface working
- ✅ Basic metric visualization in overview
- ✅ Expandable metric details functional

### Post-Talk Enhancements
- ✅ Integration with real Inspect evaluation logs
- ✅ Performance optimization for large datasets
- ✅ Additional filtering options
- ✅ Export functionality (if needed later)

## Architecture Notes

### Data Flow
```
Inspect Logs → Log Parser → Data Loader → Streamlit Components → Dashboard UI
```

### Caching Strategy
- Use `@st.cache_data` for log loading (expensive I/O)
- Cache processed conversation data
- Invalidate cache when new logs detected

### Error Handling
- Graceful handling of missing log files
- Default values for missing metrics
- User-friendly error messages for data issues

This plan provides a working dashboard for your talk while building a solid foundation for future evaluation workflows.