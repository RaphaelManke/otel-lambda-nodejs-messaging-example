import {
  EndpointType,
  LambdaIntegration,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";
import { TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { InstrumentedLambdaFunction } from "../../base-constructs/instrumented-lambda-function";

interface OtelRestApiProps {
  todoTable: TableV2;
  todoQueue: Queue;
}

export class OtelRestApi extends Construct {
  constructor(scope: Construct, id: string, props: OtelRestApiProps) {
    super(scope, id);
    const { todoTable, todoQueue } = props;
    /**
     * API Handler Lambda
     */
    const { function: apiHandlerLambda } = new InstrumentedLambdaFunction(
      this,
      "api-handler-lambda",
      {
        functionName: "otel-lambda-api-handler",
        entry: "src/app/rest-api/handler.ts",
        memorySize: 1800,
        environment: {
          TODO_TABLE_NAME: todoTable.tableName,
          TODO_QUEUE_URL: todoQueue.queueUrl,
        },
      }
    );

    // Grant the Lambda function read/write permissions to the DynamoDB table
    todoTable.grantReadWriteData(apiHandlerLambda);

    // Grant the Lambda function send message permissions to the SQS queue
    todoQueue.grantSendMessages(apiHandlerLambda);

    /**
     * REST API
     */

    const restApi = new RestApi(this, "otel-lambda-example-api", {
      restApiName: "otel-lambda-example-api",
      description: "This is an example REST API for OpenTelemetry Lambda",
      deployOptions: {},
      endpointConfiguration: {
        types: [EndpointType.REGIONAL],
      },
    });
    // Add a proxy resource to the REST API and integrate it with the Lambda function
    restApi.root.addMethod("ANY", new LambdaIntegration(apiHandlerLambda));
    restApi.root
      .resourceForPath("/todos")
      .addMethod("ANY", new LambdaIntegration(apiHandlerLambda));
    restApi.root
      .resourceForPath("/todos/{id}")
      .addMethod("ANY", new LambdaIntegration(apiHandlerLambda));
  }
}
