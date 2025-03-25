import { ILayerVersion } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { InstrumentedLambdaFunction } from "../../../base-constructs/instrumented-lambda-function";

export interface TodoSqsProcessorProps {
  todoQueue: Queue;
}

export class TodoSqsProcessor extends Construct {
  constructor(scope: Construct, id: string, props: TodoSqsProcessorProps) {
    super(scope, id);
    const { todoQueue } = props;
    /**
     * Async Processor Lambda
     */
    const asyncSqsHandlerLambda = new InstrumentedLambdaFunction(
      this,
      "sqs-handler",
      {
        functionName: "otel-lambda-async-sqs-handler",
        entry: "src/app/async/todo-processor/handler.ts",

        environment: {
          OTEL_NODE_ENABLED_INSTRUMENTATIONS: "undici",
        },
        bundling: {
          externalModules: ["@aws-lambda-powertools/batch"],
        },
      }
    );
    asyncSqsHandlerLambda.function.addEventSource(
      new SqsEventSource(todoQueue, {
        batchSize: 10,
        reportBatchItemFailures: true,
      })
    );
  }
}
