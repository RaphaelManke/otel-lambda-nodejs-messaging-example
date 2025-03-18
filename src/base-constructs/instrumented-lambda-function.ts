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
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { OtelInstrumentationConfig } from "../instrumentation/infra";

type requiredFunctionProps = Pick<
  NodejsFunctionProps,
  "functionName" | "entry"
>;
export type InstrumentedLambdaFunctionProps = Required<requiredFunctionProps> &
  NodejsFunctionProps;

const NODEJS_LAYER_VERSION = "0_12_0";
const COLLECTOR_LAYER_VERSION = "0_13_0";

const InstrumentedLambdaFunctionDefaultProps: Partial<InstrumentedLambdaFunctionProps> =
  {
    runtime: Runtime.NODEJS_22_X,
    architecture: Architecture.ARM_64,
    timeout: Duration.seconds(30),
    memorySize: 1800,

    bundling: {
      format: OutputFormat.ESM,
      mainFields: ["module", "main"],
      banner:
        "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
    },
  };

export class InstrumentedLambdaFunction extends Construct {
  private static OTEL_INSTRUMENTATION_EXTENSION_LAYER: LayerVersion;
  private static OTEL_INSTRUMENTATION_NODEJS_LAYER: ILayerVersion;
  private static OTEL_INSTRUMENTATION_COLLECTOR_LAYER: ILayerVersion;

  public readonly function: NodejsFunction;
  constructor(
    scope: Construct,
    id: string,
    props: InstrumentedLambdaFunctionProps
  ) {
    super(scope, id);

    const mergedLambdaProps = this.mergeProps({
      logGroup:
        props.logGroup ??
        new LogGroup(this, "log-group", {
          logGroupName: `/aws/lambda/${props.functionName}`,
          retention: RetentionDays.ONE_WEEK,
        }),
      ...props,
    });
    this.function = new NodejsFunction(scope, "lambda", mergedLambdaProps);

    this.addOtelLayer();
    this.addOtelEnvironmentVariables();
  }
  private mergeProps(
    props: InstrumentedLambdaFunctionProps
  ): InstrumentedLambdaFunctionProps {
    return {
      ...InstrumentedLambdaFunctionDefaultProps,
      ...props,
      bundling: {
        ...InstrumentedLambdaFunctionDefaultProps.bundling,
        ...props.bundling,
      },
    };
  }

  private addOtelLayer() {
    // Instantiate the OpenTelemetry Lambda Layer as stack singleton
    // to avoid creating multiple instances of the same layer
    // the layer is shared across all the lambda functions in the stack
    // and is put into the root of the stack
    const stack = Stack.of(this);
    InstrumentedLambdaFunction.OTEL_INSTRUMENTATION_EXTENSION_LAYER ??=
      new OtelInstrumentationConfig(stack, "instrumentation-config", {}).layer;

    InstrumentedLambdaFunction.OTEL_INSTRUMENTATION_NODEJS_LAYER ??=
      LayerVersion.fromLayerVersionArn(
        stack,
        "otel-layer-nodejs",
        `arn:aws:lambda:${stack.region}:184161586896:layer:opentelemetry-nodejs-${NODEJS_LAYER_VERSION}:1`
      );
    InstrumentedLambdaFunction.OTEL_INSTRUMENTATION_COLLECTOR_LAYER ??=
      LayerVersion.fromLayerVersionArn(
        stack,
        "otel-layer-collector",
        `arn:aws:lambda:${
          stack.region
        }:184161586896:layer:opentelemetry-collector-${
          this.function.architecture === Architecture.ARM_64 ? "arm64" : "amd64"
        }-${COLLECTOR_LAYER_VERSION}:1`
      );

    this.function.addLayers(
      InstrumentedLambdaFunction.OTEL_INSTRUMENTATION_NODEJS_LAYER,
      InstrumentedLambdaFunction.OTEL_INSTRUMENTATION_COLLECTOR_LAYER,
      InstrumentedLambdaFunction.OTEL_INSTRUMENTATION_EXTENSION_LAYER
    );
  }

  private addOtelEnvironmentVariables() {
    const ssmApiKeyParameter = StringParameter.valueForStringParameter(
      this,
      "/otel-lambda-example/api-key",
      1
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
      "/opt/collector.yaml"
    );
    this.function.addEnvironment(
      "NODE_OPTIONS",
      "--import /opt/instrumentation-config.js"
    );
  }
}
