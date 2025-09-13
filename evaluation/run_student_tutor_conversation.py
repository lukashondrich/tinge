#!/usr/bin/env python3
"""
Student-Tutor Conversation System
Integrates student persona simulation with AI tutor using the reliable session health system.
"""

import asyncio
import json
import sys
import tempfile
import time
import yaml
from collections import OrderedDict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from playwright.async_api import async_playwright, Browser, Page

# Import student simulation function
sys.path.append(str(Path(__file__).parent / 'generative_student_personas' / 'src'))
from student_personas.simulate import simulate_student


class StudentTutorConversation:
    def __init__(self, persona_id: str, personas_path: str, initial_context: Dict[str, Any]):
        self.persona_id = persona_id
        self.personas_path = personas_path
        self.initial_context = initial_context
        self.conversation_history = []
        
        # Persona metadata (captured from first simulation call)
        self.persona_traits = {}
        self.persona_behaviors = {}
        self.system_prompt = ""
        
        # Browser and logging
        self.log: List[Dict[str, Any]] = []
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None
        self.heartbeat_task: Optional[asyncio.Task] = None
        self.last_heartbeat = {'ready': None, 'ts': int(time.time() * 1000)}

    async def setup_browser(self) -> None:
        """Launch browser and setup page with all event handlers."""
        print('Launching browser...')
        playwright = await async_playwright().start()
        self.browser = await playwright.chromium.launch(headless=False)
        
        print('Creating page...')
        self.page = await self.browser.new_page()
        
        # Browser event handlers
        self.browser.on('disconnected', lambda: self._log_event('browser.disconnected'))
        
        # Page event handlers
        self.page.on('close', lambda: self._log_event('page.close'))
        self.page.on('crash', lambda: self._log_event('page.crash'))
        self.page.on('pageerror', lambda err: self._log_page_error(err))
        self.page.on('console', lambda msg: self._log_console(msg))
        self.page.on('requestfailed', lambda req: self._log_request_failed(req))
        self.page.on('response', lambda res: self._log_response(res))

    def _log_event(self, event_name: str) -> None:
        """Log browser/page events."""
        msg = {'event': event_name}
        print(f'{event_name.replace(".", " ").title()}')
        self.log.append(msg)

    def _log_page_error(self, error) -> None:
        """Log page errors."""
        msg = {
            'event': 'page.error', 
            'message': str(error),
            'stack': getattr(error, 'stack', None)
        }
        print(f'Page error: {error}')
        self.log.append(msg)

    def _log_console(self, msg) -> None:
        """Log console messages."""
        text = msg.text
        print(f'PAGE: {text}')
        self.log.append({'type': 'console', 'text': text})

    def _log_request_failed(self, request) -> None:
        """Log failed requests."""
        failure = request.failure
        self.log.append({
            'type': 'requestfailed',
            'url': request.url,
            'error': failure.error_text if failure else None
        })

    def _log_response(self, response) -> None:
        """Log HTTP responses."""
        entry = {'type': 'response', 'url': response.url, 'status': response.status}
        self.log.append(entry)
        if not response.ok:
            print(f'HTTP error {entry}')

    async def setup_heartbeat(self) -> None:
        """Setup heartbeat monitoring for data channel health."""
        async def heartbeat_monitor():
            while True:
                try:
                    if self.page and not self.page.is_closed():
                        ready = await self.page.evaluate('() => window.__isDataChannelReady()')
                        self.last_heartbeat = {'ready': ready, 'ts': int(time.time() * 1000)}
                        self.log.append({'type': 'heartbeat', **self.last_heartbeat})
                        
                        if not ready:
                            print('Data channel not ready; reconnecting')
                            try:
                                await self.page.evaluate('() => window.__connectRealtime()')
                            except Exception:
                                pass  # Ignore reconnection errors
                    
                    await asyncio.sleep(5)
                except Exception:
                    break  # Exit heartbeat on any error
        
        self.heartbeat_task = asyncio.create_task(heartbeat_monitor())

    async def connect_realtime(self) -> None:
        """Navigate to page and establish OpenAI Realtime connection."""
        print('Navigating to page...')
        
        # Try navigation with retry logic
        for attempt in range(2):
            response = await self.page.goto('http://localhost:5173/?textMode=1', timeout=60000)
            
            if response and response.ok:
                try:
                    # Wait for page to load
                    await self.page.wait_for_load_state('networkidle', timeout=10000)
                    break
                except Exception:
                    print(f'Load state timeout on attempt {attempt + 1}')
                    if attempt == 1:
                        raise
            else:
                print(f'Navigation failed on attempt {attempt + 1}')
                if attempt == 1:
                    raise Exception('Failed to navigate to page')
                await asyncio.sleep(2)
        
        print('Page loaded, connecting realtime...')
        await self.page.evaluate('() => window.__connectRealtime()')
        
        # Setup heartbeat monitoring
        await self.setup_heartbeat()

    async def wait_for_connection_and_test_health(self) -> None:
        """Wait for data channel and test session health with recovery."""
        print('Waiting for data channel to be ready...')
        await self.page.wait_for_function('() => window.__isDataChannelReady()', timeout=30000)
        print('Data channel is ready!')

        # CRITICAL: Test session health and refresh if needed
        print('Testing session health...')
        session_healthy = await self.page.evaluate('() => window.__testSessionHealth(10000)')
        
        if not session_healthy:
            print('Session unhealthy, attempting to refresh...')
            refresh_success = await self.page.evaluate('() => window.__refreshSession(2)')
            
            if not refresh_success:
                raise Exception('Failed to establish healthy OpenAI session after refresh attempts')
            print('Session refresh successful!')
        else:
            print('Session is healthy!')

    async def setup_logging(self) -> None:
        """Setup conversation logging and handlers."""
        print('Setting up logging and handlers...')
        
        # Expose Python logging function to the page
        await self.page.expose_binding('recordMsg', lambda source, msg: self.log.append(msg))
        
        # Setup page logging
        await self.page.evaluate('''() => {
            window.__pageLog = [];
            window.__registerTranscriptHandler((m) => {
                window.__pageLog.push(m);
                window.recordMsg(m);
            });
        }''')

    def simulate_student_response(self, tutor_message: str, capture_metadata: bool = False) -> str:
        """Generate student response using persona simulation."""
        print(f'Generating student response to: "{tutor_message}"')
        
        # Create temporary context file for the student simulation
        context = {
            'topic': self.initial_context.get('topic', 'Language Learning'),
            'history': self.conversation_history,
            'tutor_question': tutor_message
        }
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(context, f)
            temp_context_path = f.name
        
        try:
            # Call student simulation
            persona_data = {'id': self.persona_id, 'path': self.personas_path}
            result = simulate_student(
                persona=persona_data,
                context_path=temp_context_path,
                model="gpt-4o-mini",
                temperature=0.7,
                return_metadata=capture_metadata
            )
            
            if capture_metadata and isinstance(result, dict):
                # Store metadata for YAML output
                self.persona_traits = result["persona_traits"]
                self.persona_behaviors = result["persona_behaviors"]
                self.system_prompt = result["enhanced_prompt"]
                student_response = result["response"]
            else:
                student_response = result
            
            print(f'Student response: "{student_response}"')
            return student_response
            
        finally:
            # Clean up temp file
            Path(temp_context_path).unlink(missing_ok=True)

    async def run_student_tutor_conversation(self, turns: int = 3) -> None:
        """Run multi-turn conversation between student and tutor."""
        print(f'Starting {turns}-turn student-tutor conversation...')
        
        # Initialize empty conversation history (don't include initial context in the conversation)
        self.conversation_history = []
        
        # Generate natural initial message using student simulator with topic context
        topic = self.initial_context.get('topic', 'Language Learning')
        if self.initial_context.get('question'):
            # Use explicit question if provided
            initial_message = self.initial_context.get('question')
        else:
            # Generate topic-aware initial message using student simulator (capture metadata on first call)
            initial_message = self.simulate_student_response("Hello! Welcome to your learning session.", capture_metadata=True)
        
        for turn in range(turns):
            print(f'\n--- Turn {turn + 1}/{turns} ---')
            
            # Check connection status
            if self.page.is_closed() or not self.browser.is_connected():
                entry = {
                    'type': 'connection.lost',
                    'pageClosed': self.page.is_closed(),
                    'browserConnected': self.browser.is_connected()
                }
                self.log.append(entry)
                print(f'Connection issue {entry}')
                break
            
            # Use initial message for first turn, then simulate student response
            if turn == 0:
                student_message = initial_message
            else:
                # Get last tutor response
                tutor_messages = [msg for msg in self.conversation_history if msg['role'] == 'tutor']
                if tutor_messages:
                    last_tutor_message = tutor_messages[-1]['content']
                    student_message = self.simulate_student_response(last_tutor_message)
                else:
                    print('No tutor message to respond to!')
                    break
            
            print(f'Student: "{student_message}"')
            
            # Add student message to history
            self.conversation_history.append({'role': 'student', 'content': student_message})
            
            # Get current AI message count
            prev_ai_messages = await self.page.evaluate(
                '() => window.__pageLog.filter(msg => msg.speaker === "ai").length'
            )
            print(f'Previous AI message count: {prev_ai_messages}')
            
            # Send message to AI tutor
            await self.page.evaluate('t => window.__sendTestMessage(t)', student_message)
            print('Waiting for tutor response...')
            
            # Retry logic for this turn
            max_retries = 3
            turn_success = False
            
            for retry in range(max_retries):
                try:
                    if retry > 0:
                        print(f'Retrying turn {turn + 1}, attempt {retry + 1}/{max_retries}')
                        # Test session health and refresh if needed before retry
                        session_healthy = await self.page.evaluate('() => window.__testSessionHealth(5000)')
                        if not session_healthy:
                            print('Session unhealthy during retry, attempting refresh...')
                            await self.page.evaluate('() => window.__refreshSession(1)')
                    
                    # Wait for new AI response
                    await self.page.wait_for_function(
                        f'() => window.__pageLog.filter(msg => msg.speaker === "ai").length > {prev_ai_messages}',
                        timeout=60000
                    )
                    
                    # Get the tutor response
                    tutor_response = await self.page.evaluate('''() => {
                        const aiMessages = window.__pageLog.filter(msg => msg.speaker === "ai");
                        return aiMessages[aiMessages.length - 1]?.text || "";
                    }''')
                    
                    print(f'Tutor: "{tutor_response}"')
                    
                    # Add tutor response to history
                    self.conversation_history.append({'role': 'tutor', 'content': tutor_response})
                    
                    print('AI response received!')
                    turn_success = True
                    break
                    
                except Exception as err:
                    entry = {
                        'type': 'waitForFunction.timeout',
                        'responses': [e for e in self.log if e.get('type') == 'response'],
                        'lastHeartbeat': self.last_heartbeat,
                        'turn': turn + 1,
                        'retry': retry + 1
                    }
                    self.log.append(entry)
                    print(f'Turn {turn + 1} timeout on attempt {retry + 1}: {err}')
                    
                    if retry == max_retries - 1:
                        print(f'Turn {turn + 1} failed after {max_retries} attempts, skipping this turn')
                        # Add a placeholder response to maintain turn structure
                        self.conversation_history.append({'role': 'tutor', 'content': '[Response timeout - tutor unavailable]'})
                        turn_success = True  # Continue to next turn
                        break
                    
                    await asyncio.sleep(2)  # Wait before retry
            
            # Small delay between turns
            await asyncio.sleep(1)

    async def finalize(self) -> Dict[str, Any]:
        """Clean up and return conversation results."""
        print('Conversation complete. Keeping browser open for 10 seconds...')
        await asyncio.sleep(10)
        
        print('Preparing conversation results...')
        
        # Stop heartbeat
        if self.heartbeat_task:
            self.heartbeat_task.cancel()
            try:
                await self.heartbeat_task
            except asyncio.CancelledError:
                pass
        
        # Create structured conversation log with turn-based format
        # Each turn contains both user and assistant messages
        conversation_history_turns = {}
        turn_number = 1
        
        # Process messages in pairs (student + tutor)
        for i in range(0, len(self.conversation_history), 2):
            turn_data = {}
            
            # Add student message first, then tutor message
            if i < len(self.conversation_history) and self.conversation_history[i]['role'] == 'student':
                turn_data['student'] = self.conversation_history[i]['content']
                
                # Add tutor message if it exists
                if i + 1 < len(self.conversation_history) and self.conversation_history[i + 1]['role'] == 'tutor':
                    turn_data['tutor'] = self.conversation_history[i + 1]['content']
                
                # Add the turn
                conversation_history_turns[f'turn_{turn_number}'] = turn_data
                turn_number += 1
        
        conversation_result = {
            'persona_id': self.persona_id,
            'topic': self.initial_context.get('topic', 'Language Learning'),
            'timestamp': datetime.now().isoformat(),
            'persona_traits': self.persona_traits,
            'persona_behaviors': self.persona_behaviors,
            'system_prompt': self.system_prompt,
            'initial_context': self.initial_context,
            'conversation_history': conversation_history_turns
        }
        
        # Create conversations directory if it doesn't exist
        conversations_dir = Path('conversations')
        conversations_dir.mkdir(exist_ok=True)
        
        # Save results as YAML in conversations subfolder
        timestamp = int(time.time() * 1000)
        result_file = conversations_dir / f'student_tutor_conversation_{self.persona_id}_{timestamp}.yaml'
        
        with open(result_file, 'w') as f:
            yaml.dump(conversation_result, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
        
        print(f'Results saved to: {result_file}')
        print('Done!')
        
        return conversation_result

    async def cleanup(self) -> None:
        """Clean up browser resources."""
        if self.heartbeat_task:
            self.heartbeat_task.cancel()
            try:
                await self.heartbeat_task
            except asyncio.CancelledError:
                pass
        
        if self.page and not self.page.is_closed():
            await self.page.close()
            print('Page closed')
        
        if self.browser:
            await self.browser.close()
            print('Browser disconnected')


async def main():
    """Main function for student-tutor conversation."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Run student-tutor conversation with persona simulation')
    parser.add_argument('--persona', default='persona_02', help='Persona ID to use')
    parser.add_argument('--turns', type=int, default=3, help='Number of conversation turns')
    parser.add_argument('--context', default='conversation_starters/test_01.json', help='Path to conversation context')
    parser.add_argument('--personas-path', default='generative_student_personas/test_personas.jsonl', help='Path to personas file')
    
    args = parser.parse_args()
    
    # Load initial context
    context_path = Path(args.context)
    if not context_path.exists():
        print(f'Error: Context file not found: {context_path}')
        return
    
    with open(context_path) as f:
        initial_context = json.load(f)
    
    print(f'Starting student-tutor conversation:')
    print(f'  Persona: {args.persona}')
    print(f'  Turns: {args.turns}')
    print(f'  Topic: {initial_context.get("topic", "Unknown")}')
    
    conversation = StudentTutorConversation(
        persona_id=args.persona,
        personas_path=args.personas_path,
        initial_context=initial_context
    )
    
    try:
        # Setup browser and connect to OpenAI Realtime API
        await conversation.setup_browser()
        await conversation.connect_realtime()
        
        # Wait for connection and test session health (CRITICAL for reliability)
        await conversation.wait_for_connection_and_test_health()
        
        # Setup conversation logging
        await conversation.setup_logging()
        
        # Run student-tutor conversation
        await conversation.run_student_tutor_conversation(turns=args.turns)
        
        # Finalize and save results
        result = await conversation.finalize()
        
        return result
        
    except Exception as err:
        print(f'Error: {err}')
        conversation.log.append({
            'type': 'error',
            'message': str(err),
            'timestamp': datetime.now().isoformat()
        })
        
    finally:
        await conversation.cleanup()


if __name__ == '__main__':
    asyncio.run(main())