#!/usr/bin/env python3

import subprocess
import sys
import time
from datetime import datetime
from typing import List, Tuple

def run_missing_experiment(persona_id: str, context_file: str, scenario_name: str) -> bool:
    """Run a single missing experiment and return success status."""
    print(f"🧪 Running: {persona_id} + {scenario_name}")
    
    start_time = datetime.now()
    
    try:
        # Run the main conversation script
        result = subprocess.run([
            sys.executable, 'run_student_tutor_conversation.py',
            '--personas-path', 'personas.jsonl',
            '--persona', persona_id,
            '--context', context_file,
            '--turns', '6'
        ], capture_output=True, text=True, timeout=600)  # 10 minute timeout
        
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        if result.returncode == 0:
            print(f"   ✅ SUCCESS: {persona_id} + {scenario_name} ({duration:.1f}s)")
            return True
        else:
            print(f"   ❌ ERROR: {persona_id} + {scenario_name}")
            print(f"      Error: {result.stderr.strip()}")
            return False
    
    except subprocess.TimeoutExpired:
        print(f"   ⏰ TIMEOUT: {persona_id} + {scenario_name} (10 minutes)")
        return False
    except Exception as e:
        print(f"   💥 EXCEPTION: {persona_id} + {scenario_name}")
        print(f"      Error: {str(e)}")
        return False

def main():
    """Fill the missing persona-scenario combinations."""
    print("🔄 Filling Missing Experiment Combinations")
    print("=" * 50)
    
    # Define the missing combinations
    missing_experiments: List[Tuple[str, str, str]] = [
        ("persona_02", "conversation_starters/test_02.json", "German learning (English speaker)"),
        ("persona_09", "conversation_starters/test_01.json", "Russian learning (German speaker)"),
        ("persona_10", "conversation_starters/test_01.json", "Russian learning (German speaker)")
    ]
    
    print(f"📋 Missing combinations to fill: {len(missing_experiments)}")
    for i, (persona, context, scenario) in enumerate(missing_experiments, 1):
        print(f"   {i}. {persona} + {scenario}")
    print()
    
    # Run each missing experiment
    results = []
    pause_duration = 30  # seconds
    
    start_time = datetime.now()
    
    for i, (persona_id, context_file, scenario_name) in enumerate(missing_experiments, 1):
        print(f"📊 Experiment {i}/{len(missing_experiments)}")
        
        success = run_missing_experiment(persona_id, context_file, scenario_name)
        results.append({
            'persona_id': persona_id,
            'scenario': scenario_name,
            'success': success
        })
        
        # Pause between experiments (except for the last one)
        if i < len(missing_experiments):
            print(f"   ⏱️  Pausing {pause_duration} seconds for API rate limiting...")
            time.sleep(pause_duration)
            print()
    
    # Summary
    end_time = datetime.now()
    total_duration = (end_time - start_time).total_seconds()
    successful = sum(1 for r in results if r['success'])
    
    print("=" * 50)
    print("📈 Fill Missing Experiments Complete!")
    print(f"   Total experiments: {len(missing_experiments)}")
    print(f"   Successful: {successful}")
    print(f"   Failed: {len(missing_experiments) - successful}")
    print(f"   Success rate: {successful / len(missing_experiments):.1%}")
    print(f"   Total duration: {total_duration / 60:.1f} minutes")
    
    if successful == len(missing_experiments):
        print("🎉 All missing combinations successfully filled!")
        print("💯 Dataset now complete: 20/20 persona-scenario combinations")
    else:
        print("\n⚠️  Some experiments failed:")
        for result in results:
            if not result['success']:
                print(f"   - {result['persona_id']} + {result['scenario']}")
    
    print(f"\n📁 Check conversations/ folder for new YAML files")

if __name__ == "__main__":
    main()