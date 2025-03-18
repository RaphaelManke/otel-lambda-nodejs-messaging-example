import * as cdk from "aws-cdk-lib";
import { Stack } from "aws-cdk-lib";
import { AttributeType, Billing, TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { LayerVersion } from "aws-cdk-lib/aws-lambda";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { OtelRestApi } from "./app/rest-api/infra";
import { TodoSqsProcessor } from "./app/async/todo-processor/infra";
import {
  OTEL_NODEJS_LAYER_CONSTRUCT_ID,
  OTEL_COLLECTOR_LAYER_CONSTRUCT_ID,
} from "./constants";
import { OtelInstrumentationConfig } from "./instrumentation/infra";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class OtelLambdaExampleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // OpenTelemetry Lambda Layer
    const { account, region } = Stack.of(this);
    const otelNodeJsLayer = LayerVersion.fromLayerVersionArn(
      this,
      OTEL_NODEJS_LAYER_CONSTRUCT_ID,
      `arn:aws:lambda:${region}:184161586896:layer:opentelemetry-nodejs-0_12_0:1`
    );
    const otelCollectorLayerArm = LayerVersion.fromLayerVersionArn(
      this,
      OTEL_COLLECTOR_LAYER_CONSTRUCT_ID,
      `arn:aws:lambda:${region}:184161586896:layer:opentelemetry-collector-arm64-0_13_0:1`
    );

    // Todo dynamodb table
    const todoTable = new TableV2(this, "todo-table", {
      partitionKey: { name: "id", type: AttributeType.STRING },
      tableName: "todo-table",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billing: Billing.onDemand(),
      timeToLiveAttribute: "ttl",
    });

    // Todo queue
    const todoQueue = new Queue(this, "todo-queue", {
      queueName: "todo-queue",
      retentionPeriod: cdk.Duration.days(14),
    });

    new OtelRestApi(this, "rest-api", {
      todoTable: todoTable,
      todoQueue: todoQueue,
    });

    new TodoSqsProcessor(this, "async-processor", {
      todoQueue: todoQueue,
    });
  }
}
