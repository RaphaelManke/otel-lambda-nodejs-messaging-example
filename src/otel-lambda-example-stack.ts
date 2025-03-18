import * as cdk from "aws-cdk-lib";
import { AttributeType, Billing, TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { TodoSqsProcessor } from "./app/async/todo-processor/infra";
import { OtelRestApi } from "./app/rest-api/infra";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class OtelLambdaExampleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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
