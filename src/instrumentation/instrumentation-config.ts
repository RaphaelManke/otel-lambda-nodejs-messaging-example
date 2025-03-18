// https://www.npmjs.com/package/@opentelemetry/instrumentation-aws-sdk

import type { AwsLambdaInstrumentationConfig } from "@opentelemetry/instrumentation-aws-lambda";
import type { AwsSdkInstrumentationConfig } from "@opentelemetry/instrumentation-aws-sdk";
import {
  postRequestHook,
  preRequestHook,
} from "../extractors/extended-instrumentation";
import { getRequestIdentifier } from "../extractors/requestIdentifier";

declare global {
  // In case of downstream configuring span processors etc
  function configureLambdaInstrumentation(
    config: AwsLambdaInstrumentationConfig
  ): AwsLambdaInstrumentationConfig;
  function configureAwsInstrumentation(
    defaultConfig: AwsSdkInstrumentationConfig
  ): AwsSdkInstrumentationConfig;
  //   function configureInstrumentations(): Instrumentation[];
  //   function configureSdkRegistration(
  //     defaultSdkRegistration: SDKRegistrationConfig
  //   ): SDKRegistrationConfig;
  //   function configureTracer(defaultConfig: TracerConfig): TracerConfig;
  //   function configureTracerProvider(tracerProvider: BasicTracerProvider): void;

  //   // No explicit metric type here, but "unknown" type.
  //   // Because metric packages are important dynamically.
  //   function configureMeter(defaultConfig: unknown): unknown;
  //   function configureMeterProvider(meterProvider: unknown): void;

  //   // No explicit log type here, but "unknown" type.
  //   // Because log packages are important dynamically.
  //   function configureLoggerProvider(loggerProvider: unknown): void;
}
console.warn("Instrumentation config loaded");
let eventType: ReturnType<typeof getRequestIdentifier>;
globalThis.configureLambdaInstrumentation =
  function configureLambdaInstrumentation(config) {
    return {
      ...config,
      // sqsExtractContextPropagationFromPayload: true,
      requestHook: (span, hookInfo) => {
        const { event, context } = hookInfo;
        eventType = getRequestIdentifier(event);

        preRequestHook(span, event);
        config.requestHook?.(span, hookInfo);
      },
      responseHook: (span, hookInfo) => {
        const { res } = hookInfo;
        if (eventType) {
          postRequestHook(span, eventType, res);
        }
        config.responseHook?.(span, hookInfo);
      },
    };
  };

// globalThis.configureAwsInstrumentation = function configureAwsInstrumentation(
//   defaultConfig
// ) {
//   return {
//     ...defaultConfig,
//     preRequestHook: (span, request) => {
//       if ((request.request.serviceName = "sqs")) {

//       }
//     },
//   };
// };
