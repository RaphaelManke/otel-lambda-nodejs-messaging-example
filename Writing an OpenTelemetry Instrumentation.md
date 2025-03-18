# Writing an OpenTelemetry Instrumentation for Node.js: Step-by-Step Tutorial

In this tutorial, we'll walk through creating a custom OpenTelemetry instrumentation for a Node.js module. We'll use a simple HTTP client library as our example.

## Step 1: Set Up Your Project

First, create a new directory for your instrumentation and initialize it:

```bash
mkdir otel-custom-instrumentation
cd otel-custom-instrumentation
npm init -y
```

Install necessary dependencies:

```bash
npm install @opentelemetry/instrumentation @opentelemetry/api @opentelemetry/semantic-conventions
```

## Step 2: Define Your Instrumentation Structure

Create a basic file structure:

```bash
mkdir src
touch src/instrumentation.ts
touch src/version.ts
touch src/types.ts
touch src/index.ts
```

## Step 3: Set Up Version Information

In `src/version.ts`, define your package information:

```typescript
// This is used for instrumentation identification
export const PACKAGE_NAME = 'my-http-client-instrumentation';
export const PACKAGE_VERSION = '0.1.0';
```

## Step 4: Define Configuration Types

In `src/types.ts`, define the configuration interface for your instrumentation:

```typescript
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { Span } from '@opentelemetry/api';

// Define the configuration parameters for your instrumentation
export interface MyHttpClientInstrumentationConfig extends InstrumentationConfig {
  // Include any custom configuration options
  requestHook?: (span: Span, request: any) => void;
  responseHook?: (span: Span, response: any) => void;
}

// You can define additional types needed for your instrumentation
```

## Step 5: Create the Instrumentation Class

In instrumentation.ts, implement your instrumentation class:

```typescript
import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
  isWrapped,
} from '@opentelemetry/instrumentation';
import {
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_URL,
  SEMATTRS_HTTP_STATUS_CODE,
} from '@opentelemetry/semantic-conventions';

import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { MyHttpClientInstrumentationConfig } from './types';

// Define the module you want to instrument
type MyHttpClient = {
  request(url: string, options: any, callback: Function): void;
};

export class MyHttpClientInstrumentation extends InstrumentationBase<MyHttpClientInstrumentationConfig> {
  constructor(config: MyHttpClientInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  protected init() {
    // This method returns the module definition for the instrumentation
    return new InstrumentationNodeModuleDefinition(
      'my-http-client', // Name of the module to instrument
      ['1.*', '2.*'],   // Supported versions
      
      // onPatch function - called when the module is loaded
      (moduleExports) => {
        this._diag.debug('Patching my-http-client');
        
        // Apply patches to the module
        if (!isWrapped(moduleExports.request)) {
          this._wrap(
            moduleExports,
            'request',
            this._getPatchedRequestFunction()
          );
        }
        return moduleExports;
      },
      
      // onUnpatch function - called when unpatching
      (moduleExports) => {
        if (isWrapped(moduleExports.request)) {
          this._unwrap(moduleExports, 'request');
        }
      }
    );
  }

  // Define how to patch the target function
  private _getPatchedRequestFunction() {
    const instrumentation = this;
    
    return (original: MyHttpClient['request']) => {
      return function patchedRequest(
        this: any,
        url: string,
        options: any,
        callback: Function
      ) {
        // Create a span for this operation
        const span = instrumentation.tracer.startSpan(`HTTP ${options.method || 'GET'}`, {
          kind: SpanKind.CLIENT,
          attributes: {
            [SEMATTRS_HTTP_METHOD]: options.method || 'GET',
            [SEMATTRS_HTTP_URL]: url,
          },
        });

        // Execute the requestHook if provided
        const { requestHook } = instrumentation.getConfig();
        if (requestHook) {
          safeExecuteInTheMiddle(
            () => requestHook(span, { url, options }),
            (err) => {
              if (err) {
                instrumentation._diag.error('requestHook error', err);
              }
            },
            true
          );
        }
        
        // Create a patched callback to end the span
        const patchedCallback = (err: Error | null, response: any) => {
          if (err) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err.message,
            });
          } else {
            // Set response attributes on the span
            span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, response.statusCode);
            
            // Execute responseHook if provided
            const { responseHook } = instrumentation.getConfig();
            if (responseHook) {
              safeExecuteInTheMiddle(
                () => responseHook(span, response),
                (err) => {
                  if (err) {
                    instrumentation._diag.error('responseHook error', err);
                  }
                },
                true
              );
            }
          }
          
          // End the span
          span.end();
          
          // Call the original callback
          return callback(err, response);
        };
        
        // Call the original function within the context of our span
        return context.with(trace.setSpan(context.active(), span), () => {
          return original.call(this, url, options, patchedCallback);
        });
      };
    };
  }
}
```

## Step 6: Create the Main Export File

In `src/index.ts`, export your instrumentation:

```typescript
export * from './instrumentation';
export * from './types';
```

## Step 7: Add TypeScript Configuration and Build

Create a tsconfig.json file:

```json
{
  "compilerOptions": {
    "target": "es2017",
    "module": "commonjs",
    "declaration": true,
    "outDir": "build",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"]
}
```

Add build scripts to package.json:

```json
{
  "scripts": {
    "build": "tsc",
    "prepare": "npm run build"
  }
}
```

## Step 8: Understanding the Core Concepts

Let's break down the key components of OpenTelemetry instrumentation:

### InstrumentationBase

This is the base class for all instrumentations. It provides:
- Configuration handling
- Access to the OpenTelemetry tracer
- Wrapping and unwrapping methods
- Diagnostics logging

### InstrumentationNodeModuleDefinition

This class defines:
- Which module to instrument (`'my-http-client'`)
- Supported versions (`['1.*', '2.*']`)
- Patching and unpatching logic

### Wrapping and Patching

The patching process follows this pattern:
1. Identify the function to patch (e.g., `request` method)
2. Create a wrapper function that:
   - Starts a span before the original function executes
   - Sets appropriate attributes on the span
   - Executes the original function in the context of the span
   - Handles errors and updates span status accordingly
   - Ends the span when the operation completes

### Hooks

Hooks allow users of your instrumentation to add custom behavior:
- `requestHook`: Called before the request is sent
- `responseHook`: Called after the response is received

## Step 9: Register and Use Your Instrumentation

Create a sample application that uses your instrumentation:

```typescript
// sample-app.ts
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { MyHttpClientInstrumentation } from './build';

// Set up the tracer provider
const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.register();

// Register your instrumentation
registerInstrumentations({
  instrumentations: [
    new MyHttpClientInstrumentation({
      // Custom configuration
      requestHook: (span, request) => {
        span.setAttribute('custom.attribute', 'custom-value');
      }
    }),
  ],
});

// Now any use of my-http-client will be automatically instrumented

// Example usage of the module (would be automatically instrumented)
import * as myHttpClient from 'my-http-client';
myHttpClient.request('https://example.com', { method: 'GET' }, (err, res) => {
  console.log('Request completed');
});
```

## Step 10: Testing Your Instrumentation

Create unit tests to verify your instrumentation works correctly. Test for:
- Spans are created
- Attributes are set correctly
- Error handling works
- Custom hooks are called

## Key Takeaways

1. **Module Identification**: Your instrumentation targets a specific module and version range.
2. **Function Patching**: You patch specific functions by wrapping them with span creation/ending logic.
3. **Context Propagation**: You use `context.with()` to maintain trace context.
4. **Semantic Conventions**: Use standard attribute names from `@opentelemetry/semantic-conventions`.
5. **Error Handling**: Ensure errors are properly captured and reflected in spans.
6. **Configuration**: Allow users to customize the instrumentation behavior.

This pattern allows for non-intrusive instrumentation of third-party modules without modifying their source code.