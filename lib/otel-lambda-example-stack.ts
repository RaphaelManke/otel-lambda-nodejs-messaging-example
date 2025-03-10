import * as cdk from 'aws-cdk-lib';
import { Stack } from 'aws-cdk-lib';
import { EndpointType, LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { AttributeType, Billing, TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, LayerVersion, Runtime } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class OtelLambdaExampleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // OpenTelemetry Lambda Layer
    const { account, region } = Stack.of(this)
    const otelNodeJsLayer = LayerVersion.fromLayerVersionArn(this, 'otel-layer-nodejs', `arn:aws:lambda:${region}:184161586896:layer:opentelemetry-nodejs-0_12_0:1`)
    const otelCollectorLayerArm = LayerVersion.fromLayerVersionArn(this, 'otel-layer-collector', `arn:aws:lambda:${region}:184161586896:layer:opentelemetry-collector-arm64-0_13_0:1`)

    // const ssmApiKeyParameter = SecretValue.ssmSecure("/otel-lambda-example/api-key")
    const ssmApiKeyParameter = StringParameter.valueForStringParameter(this, '/otel-lambda-example/api-key', 1)


    // Todo dynamodb table
    const todoTable = new TableV2(this, 'todo-table', {
      partitionKey: { name: 'id', type: AttributeType.STRING },
      tableName: 'todo-table',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billing: Billing.onDemand(),
      timeToLiveAttribute: 'ttl'
    });

    // Todo queue
    const todoQueue = new Queue(this, 'todo-queue', {
      queueName: 'todo-queue',
      retentionPeriod: cdk.Duration.days(14),
    });

    /**
     * API Handler Lambda
    */

    // Create a new Lambda function
    const apiHandlerLambdaLogGroup = new LogGroup(this, 'api-handler-lambda-log-group', {
      logGroupName: '/aws/lambda/otel-lambda-api-handler',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: RetentionDays.ONE_WEEK
    });
    const apiHandlerLambda = new NodejsFunction(this, 'api-handler-lambda', {
      functionName: 'otel-lambda-api-handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      entry: 'app/api/handler.ts',
      timeout: cdk.Duration.seconds(30),
      memorySize: 1800,
      logGroup: apiHandlerLambdaLogGroup,

      layers: [otelNodeJsLayer, otelCollectorLayerArm],
      bundling: {
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: function (inputDir: string, outputDir: string): string[] {
            return [
              `cp ${inputDir}/collector/collector.yaml ${outputDir}/collector.yaml`
            ]
          }
        },
      },
      environment: {
        TODO_TABLE_NAME: todoTable.tableName,
        TODO_QUEUE_URL: todoQueue.queueUrl,

        AWS_LAMBDA_EXEC_WRAPPER: "/opt/otel-handler",
        OPENTELEMETRY_COLLECTOR_CONFIG_URI: "/var/task/collector.yaml",
        OTEL_API_KEY: ssmApiKeyParameter
      }
    });

    // Grant the Lambda function read/write permissions to the DynamoDB table
    todoTable.grantReadWriteData(apiHandlerLambda);

    // Grant the Lambda function send message permissions to the SQS queue
    todoQueue.grantSendMessages(apiHandlerLambda);

    /**
     * REST API
     */

    const restApi = new RestApi(this, 'otel-lambda-example-api', {
      restApiName: 'otel-lambda-example-api',
      description: 'This is an example REST API for OpenTelemetry Lambda',
      deployOptions: {

      },
      endpointConfiguration: {
        types: [EndpointType.REGIONAL]
      }
    });
    // Add a proxy resource to the REST API and integrate it with the Lambda function
    restApi.root.addMethod('ANY', new LambdaIntegration(apiHandlerLambda));

    /**
     * Async Processor Lambda
     */
    const asyncSqsHandlerLambdaLogGroup = new LogGroup(this, 'sqs-handler-log-group', {
      logGroupName: '/aws/lambda/otel-lambda-async-sqs-handler',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: RetentionDays.ONE_WEEK
    });
    const asyncSqsHandlerLambda = new NodejsFunction(this, 'sqs-handler', {
      functionName: 'otel-lambda-async-sqs-handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      entry: 'app/async/todo-processor/handler.ts',
      timeout: cdk.Duration.seconds(30),
      memorySize: 1800,
      logGroup: asyncSqsHandlerLambdaLogGroup,

      layers: [otelNodeJsLayer, otelCollectorLayerArm],
      bundling: {
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: function (inputDir: string, outputDir: string): string[] {
            return [
              `cp ${inputDir}/collector/collector.yaml ${outputDir}/collector.yaml`
            ]
          }
        },
        format: OutputFormat.ESM,
        mainFields: ['module', "main"],
        banner: "import { createRequire } from 'module';const require = createRequire(import.meta.url);",

      },
      environment: {
        TODO_TABLE_NAME: todoTable.tableName,

        AWS_LAMBDA_EXEC_WRAPPER: "/opt/otel-handler",
        OPENTELEMETRY_COLLECTOR_CONFIG_URI: "/var/task/collector.yaml",
        OTEL_API_KEY: ssmApiKeyParameter
      }
    });
    asyncSqsHandlerLambda.addEventSource(new SqsEventSource(todoQueue, {
      batchSize: 10,
      reportBatchItemFailures: true,
    }));
  }
}
