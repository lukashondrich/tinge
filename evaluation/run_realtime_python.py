#!/usr/bin/env python3
"""
Python port of run_realtime.js with complete session health and recovery system.
Functionally equivalent to the JavaScript version for reliable OpenAI Realtime API usage.
"""

import asyncio
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from playwright.async_api import async_playwright, Browser, Page


class RealtimeConversation:
    def __init__(self):
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

    async def run_conversation(self, prompts: List[str]) -> None:
        """Run conversation with given prompts."""
        print('Starting conversation...')
        
        for prompt in prompts:
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
            
            print(f'Sending: "{prompt}"')
            
            # Get current AI message count
            prev_ai_messages = await self.page.evaluate(
                '() => window.__pageLog.filter(msg => msg.speaker === "ai").length'
            )
            print(f'Previous AI message count: {prev_ai_messages}')
            
            # Send message to AI
            await self.page.evaluate('t => window.__sendTestMessage(t)', prompt)
            print('Waiting for AI response...')
            
            try:
                # Wait for new AI response
                await self.page.wait_for_function(
                    f'() => window.__pageLog.filter(msg => msg.speaker === "ai").length > {prev_ai_messages}',
                    timeout=60000
                )
                print('AI response received!')
                
            except Exception as err:
                entry = {
                    'type': 'waitForFunction.timeout',
                    'responses': [e for e in self.log if e.get('type') == 'response'],
                    'lastHeartbeat': self.last_heartbeat
                }
                self.log.append(entry)
                print(f'waitForFunction timeout {entry}')
                raise err

    async def finalize(self) -> None:
        """Clean up and save results."""
        print('Conversation complete. Keeping browser open for 10 seconds...')
        await asyncio.sleep(10)
        
        print('Writing conversation log...')
        
        # Stop heartbeat
        if self.heartbeat_task:
            self.heartbeat_task.cancel()
            try:
                await self.heartbeat_task
            except asyncio.CancelledError:
                pass
        
        # Save log
        timestamp = int(time.time() * 1000)
        log_file = f'conversation_log_python_{timestamp}.json'
        
        with open(log_file, 'w') as f:
            json.dump(self.log, f, indent=2)
        
        print('Done!')

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
    """Main function - functionally equivalent to the JavaScript version."""
    conversation = RealtimeConversation()
    
    try:
        # Setup browser and page
        await conversation.setup_browser()
        
        # Connect to OpenAI Realtime API
        await conversation.connect_realtime()
        
        # Wait for connection and test session health (CRITICAL for reliability)
        await conversation.wait_for_connection_and_test_health()
        
        # Setup conversation logging
        await conversation.setup_logging()
        
        # Run conversation with predefined prompts
        prompts = [
            'Hello there!',
            'Can you tell me a joke?'
        ]
        await conversation.run_conversation(prompts)
        
        # Finalize and save results
        await conversation.finalize()
        
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