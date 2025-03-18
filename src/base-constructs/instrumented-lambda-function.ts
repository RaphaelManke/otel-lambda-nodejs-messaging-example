import { Duration, Stack } from "aws-cdk-lib";
import {
  Architecture,
  ILayerVersion,
  LayerVersion,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import {
  NodejsFunction,
  NodejsFunctionProps,
  OutputFormat,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { ILogGroup, LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import exp from "constants";
import { Construct } from "constructs";
import {
  OTEL_COLLECTOR_LAYER_CONSTRUCT_ID,
  OTEL_NODEJS_LAYER_CONSTRUCT_ID,
} from "../constants";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { OtelInstrumentationConfig } from "../instrumentation/infra";

type requiredFunctionProps = Pick<
  NodejsFunctionProps,
  "functionName" | "entry"
>;
export type InstrumentedLambdaFunctionProps = Required<requiredFunctionProps> &
  NodejsFunctionProps;

export class InstrumentedLambdaFunction extends Construct {
  private static OTEL_INSTRUMENTATION_LAYER: LayerVersion;

  public readonly function: NodejsFunction;
  public readonly logGroup: ILogGroup;
  constructor(
    scope: Construct,
    id: string,
    props: InstrumentedLambdaFunctionProps
  ) {
    super(scope, id);
    if (InstrumentedLambdaFunction.OTEL_INSTRUMENTATION_LAYER === undefined) {
      InstrumentedLambdaFunction.OTEL_INSTRUMENTATION_LAYER =
        new OtelInstrumentationConfig(
          Stack.of(this),
          "instrumentation-config",
          {}
        ).layer;
    }

    const ssmApiKeyParameter = StringParameter.valueForStringParameter(
      this,
      "/otel-lambda-example/api-key",
      1
    );

    this.logGroup =
      props.logGroup ??
      new LogGroup(this, "log-group", {
        logGroupName: `/aws/lambda/${props.functionName}`,
        retention: RetentionDays.ONE_WEEK,
      });
    this.function = new NodejsFunction(scope, "lambda", {
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(30),
      memorySize: 1800,

      ...props,
      logGroup: this.logGroup,

      environment: {
        ...props.environment,
      },
      bundling: {
        format: OutputFormat.ESM,
        mainFields: ["module", "main"],
        banner:
          "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
        ...props.bundling,
        commandHooks: {
          beforeBundling: props.bundling?.commandHooks?.beforeBundling
            ? props.bundling?.commandHooks?.beforeBundling
            : () => [],
          beforeInstall: props.bundling?.commandHooks?.beforeInstall
            ? props.bundling?.commandHooks?.beforeInstall
            : () => [],
          afterBundling: function (
            inputDir: string,
            outputDir: string
          ): string[] {
            const otherBundlingResult = props.bundling?.commandHooks
              ?.afterBundling
              ? props.bundling?.commandHooks?.afterBundling(inputDir, outputDir)
              : [];
            return [
              ...otherBundlingResult,
              `cp ${inputDir}/src/collector/collector.yaml ${outputDir}/collector.yaml`,
            ];
          },
        },
      },
    });
    const rootAllChildNodes = this.node.root.node.findAll();
    const otelNodeJsLayer = rootAllChildNodes.find(
      (node) => node.node.id === OTEL_NODEJS_LAYER_CONSTRUCT_ID
    ) as LayerVersion | undefined;
    const otelCollectorLayerArm = rootAllChildNodes.find(
      (node) => node.node.id === OTEL_COLLECTOR_LAYER_CONSTRUCT_ID
    ) as LayerVersion | undefined;
    if (!otelNodeJsLayer || !otelCollectorLayerArm) {
      throw new Error(
        "OpenTelemetry Lambda Layers not found in the stack. Please add them to the stack."
      );
    }

    this.function.addLayers(
      otelNodeJsLayer,
      otelCollectorLayerArm,
      InstrumentedLambdaFunction.OTEL_INSTRUMENTATION_LAYER
    );
    this.function.addEnvironment(
      "OTEL_DATA_INGEST_API_KEY",
      ssmApiKeyParameter
    );
    this.function.addEnvironment(
      "AWS_LAMBDA_EXEC_WRAPPER",
      "/opt/otel-handler"
    );
    this.function.addEnvironment(
      "OPENTELEMETRY_COLLECTOR_CONFIG_URI",
      "/var/task/collector.yaml"
    );
    this.function.addEnvironment(
      "NODE_OPTIONS",
      "--import /opt/instrumentation-config.js"
    );
  }
}
