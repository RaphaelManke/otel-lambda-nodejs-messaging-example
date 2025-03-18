import { TypeScriptCode } from "@mrgrain/cdk-esbuild";
import { IAspect, Stack } from "aws-cdk-lib";
import {
  Architecture,
  Function,
  ILayerVersion,
  LayerVersion,
} from "aws-cdk-lib/aws-lambda";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { IConstruct } from "constructs";

export class OtelLambdaInstrumentation implements IAspect {
  private static OTEL_INSTRUMENTATION_EXTENSION_LAYER: LayerVersion;
  private static OTEL_INSTRUMENTATION_NODEJS_LAYER: ILayerVersion;
  private static OTEL_INSTRUMENTATION_COLLECTOR_LAYER: ILayerVersion;
  private static OTEL_INSTRUMENTATION_API_KEY: string;

  private readonly instrumentationConfigCode: TypeScriptCode;
  private static NODEJS_LAYER_VERSION: string;
  private static COLLECTOR_LAYER_VERSION: string;

  constructor(props?: {
    nodejsLayerVersion?: string;
    collectorLayerVersion?: string;
  }) {
    this.instrumentationConfigCode = new TypeScriptCode(
      "src/instrumentation/instrumentation-config.ts",
      {
        copyDir: ["src/collector"],
        buildOptions: {},
      }
    );
    OtelLambdaInstrumentation.NODEJS_LAYER_VERSION =
      props?.nodejsLayerVersion || "0_12_0";
    OtelLambdaInstrumentation.COLLECTOR_LAYER_VERSION =
      props?.collectorLayerVersion || "0_13_0";
  }

  public visit(node: IConstruct): void {
    // See that we're dealing with a CfnBucket
    if (node instanceof Function) {
      const lambda = node as Function;
      this.addOtelLayer(lambda);
      this.addOtelEnvironmentVariables(lambda);
    }
  }

  private addOtelLayer(lambda: Function): void {
    // Instantiate the OpenTelemetry Lambda Layer as stack singleton
    // to avoid creating multiple instances of the same layer
    // the layer is shared across all the lambda functions in the stack
    // and is put into the root of the stack
    const stack = Stack.of(lambda);
    OtelLambdaInstrumentation.OTEL_INSTRUMENTATION_EXTENSION_LAYER ??=
      new LayerVersion(stack, "instrumentation-config-layer", {
        code: this.instrumentationConfigCode,
      });

    OtelLambdaInstrumentation.OTEL_INSTRUMENTATION_NODEJS_LAYER ??=
      LayerVersion.fromLayerVersionArn(
        stack,
        "otel-layer-nodejs",
        `arn:aws:lambda:${stack.region}:184161586896:layer:opentelemetry-nodejs-${OtelLambdaInstrumentation.NODEJS_LAYER_VERSION}:1`
      );
    OtelLambdaInstrumentation.OTEL_INSTRUMENTATION_COLLECTOR_LAYER ??=
      LayerVersion.fromLayerVersionArn(
        stack,
        "otel-layer-collector",
        `arn:aws:lambda:${
          stack.region
        }:184161586896:layer:opentelemetry-collector-${
          lambda.architecture === Architecture.ARM_64 ? "arm64" : "amd64"
        }-${OtelLambdaInstrumentation.COLLECTOR_LAYER_VERSION}:1`
      );

    lambda.addLayers(
      OtelLambdaInstrumentation.OTEL_INSTRUMENTATION_NODEJS_LAYER,
      OtelLambdaInstrumentation.OTEL_INSTRUMENTATION_COLLECTOR_LAYER,
      OtelLambdaInstrumentation.OTEL_INSTRUMENTATION_EXTENSION_LAYER
    );
  }

  private addOtelEnvironmentVariables(lambda: Function): void {
    OtelLambdaInstrumentation.OTEL_INSTRUMENTATION_API_KEY ??=
      StringParameter.valueForStringParameter(
        Stack.of(lambda),
        "/otel-lambda-example/api-key",
        1
      );

    lambda.addEnvironment(
      "OTEL_DATA_INGEST_API_KEY",
      OtelLambdaInstrumentation.OTEL_INSTRUMENTATION_API_KEY
    );
    lambda.addEnvironment("AWS_LAMBDA_EXEC_WRAPPER", "/opt/otel-handler");
    lambda.addEnvironment(
      "OPENTELEMETRY_COLLECTOR_CONFIG_URI",
      "/opt/collector.yaml"
    );
    lambda.addEnvironment(
      "NODE_OPTIONS",
      "--import /opt/instrumentation-config.js"
    );
  }
}
