#!/usr/bin/env python3

import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

def load_persona_ids(personas_file: str) -> List[str]:
    """Load all persona IDs from the personas JSONL file."""
    persona_ids = []
    with open(personas_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                data = json.loads(line)
                persona_ids.append(data['id'])
    return sorted(persona_ids)

def load_conversation_starters() -> List[Tuple[str, str]]:
    """Load conversation starter files and return list of (filename, topic_name) tuples."""
    starters_dir = Path("conversation_starters")
    starters = []
    
    for starter_file in sorted(starters_dir.glob("test_*.json")):
        with open(starter_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            topic = data.get('topic', '').strip()
            
            # Extract meaningful topic name for file naming
            if 'russian' in topic.lower():
                topic_name = 'german_to_russian'
            elif 'german' in topic.lower():
                topic_name = 'english_to_german'
            else:
                topic_name = starter_file.stem
                
        starters.append((str(starter_file), topic_name))
    
    return starters

def run_single_experiment(personas_file: str, persona_id: str, starter_file: str, 
                         topic_name: str, turns: int = 6) -> Dict:
    """Run a single conversation experiment and return results."""
    print(f"  Running: {persona_id} with {topic_name}")
    
    start_time = datetime.now()
    
    try:
        # Run the main conversation script
        result = subprocess.run([
            sys.executable, 'run_student_tutor_conversation.py',
            '--personas-path', personas_file,
            '--persona', persona_id,
            '--context', starter_file,
            '--turns', str(turns)
        ], capture_output=True, text=True, timeout=600)  # 10 minute timeout
        
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        if result.returncode == 0:
            return {
                'status': 'success',
                'persona_id': persona_id,
                'topic_name': topic_name,
                'starter_file': starter_file,
                'turns': turns,
                'duration_seconds': duration,
                'timestamp': start_time.isoformat(),
                'output': result.stdout.strip()
            }
        else:
            return {
                'status': 'error',
                'persona_id': persona_id,
                'topic_name': topic_name,
                'starter_file': starter_file,
                'turns': turns,
                'duration_seconds': duration,
                'timestamp': start_time.isoformat(),
                'error': result.stderr.strip(),
                'output': result.stdout.strip()
            }
    
    except subprocess.TimeoutExpired:
        return {
            'status': 'timeout',
            'persona_id': persona_id,
            'topic_name': topic_name,
            'starter_file': starter_file,
            'turns': turns,
            'duration_seconds': 600,
            'timestamp': start_time.isoformat(),
            'error': 'Experiment timed out after 10 minutes'
        }
    except Exception as e:
        return {
            'status': 'exception',
            'persona_id': persona_id,
            'topic_name': topic_name,
            'starter_file': starter_file,
            'turns': turns,
            'duration_seconds': 0,
            'timestamp': start_time.isoformat(),
            'error': str(e)
        }

def generate_summary_report(results: List[Dict], output_file: str):
    """Generate a summary report of all experiment results."""
    total_experiments = len(results)
    successful = sum(1 for r in results if r['status'] == 'success')
    failed = total_experiments - successful
    
    total_duration = sum(r['duration_seconds'] for r in results)
    avg_duration = total_duration / total_experiments if total_experiments > 0 else 0
    
    # Group results by status
    status_counts = {}
    for result in results:
        status = result['status']
        status_counts[status] = status_counts.get(status, 0) + 1
    
    # Group results by persona and topic
    persona_success = {}
    topic_success = {}
    
    for result in results:
        persona = result['persona_id']
        topic = result['topic_name']
        success = result['status'] == 'success'
        
        if persona not in persona_success:
            persona_success[persona] = {'success': 0, 'total': 0}
        persona_success[persona]['total'] += 1
        if success:
            persona_success[persona]['success'] += 1
            
        if topic not in topic_success:
            topic_success[topic] = {'success': 0, 'total': 0}
        topic_success[topic]['total'] += 1
        if success:
            topic_success[topic]['success'] += 1
    
    # Generate report
    report = {
        'experiment_summary': {
            'total_experiments': total_experiments,
            'successful': successful,
            'failed': failed,
            'success_rate': successful / total_experiments if total_experiments > 0 else 0,
            'total_duration_minutes': total_duration / 60,
            'average_duration_seconds': avg_duration
        },
        'status_breakdown': status_counts,
        'persona_performance': {
            pid: {
                'success_rate': data['success'] / data['total'],
                'successful': data['success'],
                'total': data['total']
            } for pid, data in persona_success.items()
        },
        'topic_performance': {
            topic: {
                'success_rate': data['success'] / data['total'],
                'successful': data['success'], 
                'total': data['total']
            } for topic, data in topic_success.items()
        },
        'detailed_results': results,
        'timestamp': datetime.now().isoformat()
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    
    return report

def main():
    """Main batch experiment runner."""
    # Check for test mode
    test_mode = len(sys.argv) > 1 and sys.argv[1] == '--test'
    
    if test_mode:
        print("🧪 TEST MODE: Configuration Check Only")
    else:
        print("🚀 Starting Batch Student-Tutor Conversation Experiment")
    print("=" * 60)
    
    # Configuration
    personas_file = "personas.jsonl"
    turns_per_conversation = 6
    pause_between_conversations = 30  # seconds
    
    # Load personas and conversation starters
    print("📋 Loading experiment configuration...")
    persona_ids = load_persona_ids(personas_file)
    conversation_starters = load_conversation_starters()
    
    total_experiments = len(persona_ids) * len(conversation_starters)
    
    print(f"   Found {len(persona_ids)} personas: {', '.join(persona_ids)}")
    print(f"   Found {len(conversation_starters)} conversation starters:")
    for starter_file, topic_name in conversation_starters:
        print(f"     - {topic_name} ({starter_file})")
    print(f"   Total experiments to run: {total_experiments}")
    print(f"   Turns per conversation: {turns_per_conversation}")
    print(f"   Pause between conversations: {pause_between_conversations} seconds")
    
    estimated_time = total_experiments * (45 + pause_between_conversations)  # rough estimate
    print(f"   Estimated total time: ~{estimated_time // 60} minutes")
    print()
    
    # Exit if in test mode
    if test_mode:
        print("✅ Configuration check complete. Use without --test to run experiments.")
        return
    
    # Ensure conversations directory exists
    os.makedirs("conversations", exist_ok=True)
    
    # Run experiments
    results = []
    experiment_count = 0
    
    start_time = datetime.now()
    
    for persona_id in persona_ids:
        for starter_file, topic_name in conversation_starters:
            experiment_count += 1
            
            print(f"🧪 Experiment {experiment_count}/{total_experiments}")
            
            # Run the experiment
            result = run_single_experiment(
                personas_file, persona_id, starter_file, topic_name, turns_per_conversation
            )
            results.append(result)
            
            # Print result
            status_emoji = "✅" if result['status'] == 'success' else "❌"
            print(f"   {status_emoji} {result['status'].upper()}: {persona_id} + {topic_name}")
            if result['status'] != 'success':
                print(f"      Error: {result.get('error', 'Unknown error')}")
            
            # Pause between experiments (except for the last one)
            if experiment_count < total_experiments:
                print(f"   ⏱️  Pausing {pause_between_conversations} seconds for API rate limiting...")
                time.sleep(pause_between_conversations)
                print()
    
    # Generate summary
    end_time = datetime.now()
    total_duration = (end_time - start_time).total_seconds()
    
    print("=" * 60)
    print("📊 Generating Summary Report...")
    
    summary_file = f"batch_experiment_summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    report = generate_summary_report(results, summary_file)
    
    # Print summary
    summary = report['experiment_summary']
    print(f"✨ Batch Experiment Complete!")
    print(f"   Total experiments: {summary['total_experiments']}")
    print(f"   Successful: {summary['successful']}")
    print(f"   Failed: {summary['failed']}")
    print(f"   Success rate: {summary['success_rate']:.1%}")
    print(f"   Total duration: {summary['total_duration_minutes']:.1f} minutes")
    print(f"   Average per experiment: {summary['average_duration_seconds']:.1f} seconds")
    print()
    print(f"📁 Results saved to: {summary_file}")
    print(f"💾 Individual conversations saved to: conversations/ folder")
    
    if summary['failed'] > 0:
        print("\n⚠️  Failed experiments:")
        for result in results:
            if result['status'] != 'success':
                print(f"   - {result['persona_id']} + {result['topic_name']}: {result['status']}")

if __name__ == "__main__":
    main()