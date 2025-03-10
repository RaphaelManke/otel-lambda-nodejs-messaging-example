# OpenTelemetry AWS Lambda Messaging Example

This project demonstrates how to implement distributed tracing and observability in AWS Lambda functions using OpenTelemetry. The sample application processes HTTP requests, writes data to DynamoDB, and sends messages to SQS for asynchronous processing. All components are instrumented with OpenTelemetry for distributed tracing and observability. The application uses AWS CDK to deploy the infrastructure. 

## Architecture

```
┌────────────┐     ┌─────────────┐     ┌─────────────┐
│            │     │             │     │             │
│ API Gateway├────►│  API Lambda ├────►│  DynamoDB   │
│            │     │             │     │             │
└────────────┘     └──────┬──────┘     └─────────────┘
                          │
                          ▼
                   ┌────────────┐      ┌────────────┐
                   │            │      │            │
                   │ SQS Queue  ├─────►│ SQS Lambda │
                   │            │      │            │
                   └────────────┘      └────────────┘

                   OpenTelemetry distributed tracing
```

The sample application has these components:
- API Gateway receives HTTP requests and routes them to the API Lambda function
- API Lambda processes requests, stores data in DynamoDB, and sends messages to SQS
- SQS Queue holds messages for asynchronous processing
- SQS Lambda consumes messages from the queue and processes them

All components are instrumented with OpenTelemetry for distributed tracing and observability.

## Prerequisites

- Node.js 18+
- AWS CLI configured with appropriate permissions
- AWS CDK installed (`npm install -g aws-cdk`)

## Setup

1. Clone the repository:
   ```
   git clone <repository-url>
   cd otel-lambda-example
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create an API key for your observability backend (this example uses Dash0):
   ```
   aws ssm put-parameter --name "/otel-lambda-example/api-key" --type "String" --value "your-api-key"
   ```

4. Deploy the stack:
   ```
   npm run build
   cdk deploy
   ```

## How It Works

1. The infrastructure is defined in otel-lambda-example-stack.ts using AWS CDK
2. Two Lambda functions are created:
   - API Handler ([app/api/handler.ts](app/api/handler.ts)): Processes HTTP requests, writes to DynamoDB, and sends messages to SQS
   - SQS Handler ([app/async/todo-processor/handler.ts](app/async/todo-processor/handler.ts)): Processes messages from SQS

3. Both Lambda functions use OpenTelemetry layers for instrumentation:
   - `opentelemetry-nodejs`: Provides automatic instrumentation for Node.js applications
   - `opentelemetry-collector`: Collects and exports telemetry data

4. Telemetry configuration in collector.yaml defines how telemetry data is processed and exported

## Key Features

- **Distributed Tracing**: Trace requests across API Gateway, Lambda functions, DynamoDB, and SQS
- **Log Correlation**: Logs are correlated with trace IDs for easy debugging
- **Semantic Conventions**: Uses OpenTelemetry semantic conventions for standardized telemetry data
- **AWS Lambda Layers**: Leverages AWS Lambda layers for easy instrumentation
- **Batch Processing**: Demonstrates tracing in batch processing scenarios

## Observability

The application exports telemetry data to the configured backend (Dash0 in this example). You can visualize:

- Distributed traces across services
- Logs correlated with traces
- Service dependencies and performance
- Error rates and latency

## Cleaning Up

To avoid incurring charges, delete the stack when you're done:

```
cdk destroy
```

## Further Reading

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [AWS Lambda with OpenTelemetry](https://aws.amazon.com/blogs/compute/using-aws-distro-for-opentelemetry-with-aws-lambda/)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
