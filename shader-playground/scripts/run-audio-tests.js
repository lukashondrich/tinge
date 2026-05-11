#!/usr/bin/env node

/**
 * Audio Test Runner
 * 
 * Comprehensive test runner for audio functionality testing
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const TEST_CONFIG = {
  unit: {
    command: 'npx vitest run --config src/tests/audio/vitest.config.js',
    description: 'Audio Unit Tests'
  },
  integration: {
    command: 'npx vitest run tests/integration/audio-integration.test.js',
    description: 'Audio Integration Tests'
  },
  e2e: {
    command: 'npx playwright test --config playwright.config.js',
    description: 'Audio E2E Tests'
  },
  coverage: {
    command: 'npx vitest run --config src/tests/audio/vitest.config.js --coverage',
    description: 'Audio Test Coverage'
  }
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Utility functions
const log = (message, color = colors.white) => {
  console.log(`${color}${message}${colors.reset}`);
};

const logSuccess = (message) => log(`✅ ${message}`, colors.green);
const logError = (message) => log(`❌ ${message}`, colors.red);
const logWarning = (message) => log(`⚠️ ${message}`, colors.yellow);
const logInfo = (message) => log(`ℹ️ ${message}`, colors.blue);

// Create test results directory
const createTestResultsDir = () => {
  const testResultsDir = join(__dirname, '..', 'test-results');
  if (!existsSync(testResultsDir)) {
    mkdirSync(testResultsDir, { recursive: true });
  }
  return testResultsDir;
};

// Run a single test suite
const runTestSuite = async (suiteName, config) => {
  logInfo(`Running ${config.description}...`);
  
  try {
    const startTime = Date.now();
    const output = execSync(config.command, {
      cwd: join(__dirname, '..'),
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    const duration = Date.now() - startTime;
    logSuccess(`${config.description} completed in ${duration}ms`);
    
    return {
      suite: suiteName,
      success: true,
      duration,
      output: output.toString()
    };
  } catch (error) {
    logError(`${config.description} failed: ${error.message}`);
    
    return {
      suite: suiteName,
      success: false,
      duration: 0,
      output: error.stdout ? error.stdout.toString() : '',
      error: error.stderr ? error.stderr.toString() : error.message
    };
  }
};

// Generate test report
const generateTestReport = (results, testResultsDir) => {
  const reportPath = join(testResultsDir, 'audio-test-report.json');
  
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      duration: results.reduce((sum, r) => sum + r.duration, 0)
    },
    results: results
  };
  
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  logInfo(`Test report generated: ${reportPath}`);
  
  return report;
};

// Generate HTML report
const generateHTMLReport = (report, testResultsDir) => {
  const htmlPath = join(testResultsDir, 'audio-test-report.html');
  
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Audio Test Report</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .summary {
            display: flex;
            justify-content: space-around;
            margin-bottom: 30px;
            padding: 20px;
            background-color: #f8f9fa;
            border-radius: 8px;
        }
        .summary-item {
            text-align: center;
        }
        .summary-item h3 {
            margin: 0;
            font-size: 2em;
        }
        .summary-item p {
            margin: 5px 0 0 0;
            color: #666;
        }
        .passed { color: #28a745; }
        .failed { color: #dc3545; }
        .duration { color: #007bff; }
        .results {
            margin-top: 30px;
        }
        .test-suite {
            margin-bottom: 20px;
            border: 1px solid #ddd;
            border-radius: 8px;
            overflow: hidden;
        }
        .test-suite-header {
            padding: 15px;
            background-color: #f8f9fa;
            border-bottom: 1px solid #ddd;
            font-weight: bold;
        }
        .test-suite-content {
            padding: 15px;
        }
        .success {
            background-color: #d4edda;
            color: #155724;
        }
        .failure {
            background-color: #f8d7da;
            color: #721c24;
        }
        .output {
            background-color: #f8f9fa;
            padding: 10px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 0.9em;
            white-space: pre-wrap;
            max-height: 300px;
            overflow-y: auto;
        }
        .error {
            background-color: #f8d7da;
            color: #721c24;
            padding: 10px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 0.9em;
            white-space: pre-wrap;
            max-height: 300px;
            overflow-y: auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Audio Test Report</h1>
            <p>Generated on ${new Date(report.timestamp).toLocaleString()}</p>
        </div>
        
        <div class="summary">
            <div class="summary-item">
                <h3 class="passed">${report.summary.passed}</h3>
                <p>Passed</p>
            </div>
            <div class="summary-item">
                <h3 class="failed">${report.summary.failed}</h3>
                <p>Failed</p>
            </div>
            <div class="summary-item">
                <h3>${report.summary.total}</h3>
                <p>Total</p>
            </div>
            <div class="summary-item">
                <h3 class="duration">${report.summary.duration}ms</h3>
                <p>Duration</p>
            </div>
        </div>
        
        <div class="results">
            <h2>Test Results</h2>
            ${report.results.map(result => `
                <div class="test-suite">
                    <div class="test-suite-header ${result.success ? 'success' : 'failure'}">
                        ${result.suite.toUpperCase()} - ${result.success ? 'PASSED' : 'FAILED'}
                        ${result.duration > 0 ? `(${result.duration}ms)` : ''}
                    </div>
                    <div class="test-suite-content">
                        ${result.output ? `
                            <h4>Output:</h4>
                            <div class="output">${result.output}</div>
                        ` : ''}
                        ${result.error ? `
                            <h4>Error:</h4>
                            <div class="error">${result.error}</div>
                        ` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>
  `;
  
  writeFileSync(htmlPath, html);
  logInfo(`HTML report generated: ${htmlPath}`);
};

// Main execution
const main = async () => {
  const args = process.argv.slice(2);
  const testSuites = args.length > 0 ? args : Object.keys(TEST_CONFIG);
  
  log('🎵 Audio Test Runner', colors.magenta);
  log('==================', colors.magenta);
  
  logInfo(`Running test suites: ${testSuites.join(', ')}`);
  
  // Create test results directory
  const testResultsDir = createTestResultsDir();
  
  // Run tests
  const results = [];
  
  for (const suiteName of testSuites) {
    if (!TEST_CONFIG[suiteName]) {
      logWarning(`Unknown test suite: ${suiteName}`);
      continue;
    }
    
    const result = await runTestSuite(suiteName, TEST_CONFIG[suiteName]);
    results.push(result);
  }
  
  // Generate reports
  const report = generateTestReport(results, testResultsDir);
  generateHTMLReport(report, testResultsDir);
  
  // Summary
  log('\\n📊 Test Summary', colors.magenta);
  log('================', colors.magenta);
  
  logInfo(`Total test suites: ${report.summary.total}`);
  logSuccess(`Passed: ${report.summary.passed}`);
  
  if (report.summary.failed > 0) {
    logError(`Failed: ${report.summary.failed}`);
  }
  
  logInfo(`Total duration: ${report.summary.duration}ms`);
  
  // Exit with appropriate code
  process.exit(report.summary.failed > 0 ? 1 : 0);
};

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logError(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logError(`Unhandled rejection: ${reason}`);
  process.exit(1);
});

// Run the main function
main().catch((error) => {
  logError(`Test runner failed: ${error.message}`);
  process.exit(1);
});
