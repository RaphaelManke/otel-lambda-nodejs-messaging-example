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
      externalModules: ["@aws-sdk/*", "@aws-lambda-powertools/*"],
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
}
