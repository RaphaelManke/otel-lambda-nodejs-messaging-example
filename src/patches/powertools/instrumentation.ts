import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  propagation,
  ROOT_CONTEXT,
  Link,
  Attributes,
  diag,
} from "@opentelemetry/api";
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
  isWrapped,
  InstrumentationConfig,
} from "@opentelemetry/instrumentation";

import {
  ATTR_MESSAGING_SYSTEM,
  ATTR_MESSAGING_OPERATION_NAME,
  ATTR_MESSAGING_MESSAGE_ID,
} from "@opentelemetry/semantic-conventions/incubating";
import type * as batchProcessorModule from "@aws-lambda-powertools/batch";

// Define the configuration interface for our instrumentation
export interface BatchProcessorInstrumentationConfig
  extends InstrumentationConfig {
  /**
   * Hook to modify spans before they are started
   */
  recordHook?: (span: any, record: any) => void;

  /**
   * Whether to enable automatic extraction of context from SQS messages
   */
  enableSqsContextExtraction?: boolean;
}

// Define constants for our instrumentation
const PACKAGE_NAME =
  "@opentelemetry/instrumentation-aws-lambda-powertools-batch";
const PACKAGE_VERSION = "0.1.0";

export class BatchProcessorInstrumentation extends InstrumentationBase<BatchProcessorInstrumentationConfig> {
  constructor(config: BatchProcessorInstrumentationConfig = {}) {
    super(
      PACKAGE_NAME,
      PACKAGE_VERSION,
      Object.assign(
        {},
        {
          enableSqsContextExtraction: true,
        },
        config
      )
    );
    console.log("BatchProcessorInstrumentation constructor");
  }

  protected init() {
    const module = new InstrumentationNodeModuleDefinition(
      "@aws-lambda-powertools/batch",
      ["*"],
      // patch
      (moduleExports: typeof batchProcessorModule) => {
        console.log("BatchProcessorInstrumentation init patch");
        if (
          moduleExports.BatchProcessor &&
          !isWrapped(moduleExports.BatchProcessor.prototype.processRecord)
        ) {
          this._wrap(
            moduleExports.BatchProcessor.prototype,
            "processRecord",
            this._getPatchedProcessRecordFunction()
          );
        }
        return moduleExports;
      },
      // unpatch
      (moduleExports: typeof batchProcessorModule) => {
        diag.debug("BatchProcessorInstrumentation init unpatch");

        if (
          moduleExports.BatchProcessor &&
          isWrapped(moduleExports.BatchProcessor.prototype.processRecord)
        ) {
          this._unwrap(moduleExports.BatchProcessor.prototype, "processRecord");
        }
      }
    );
    diag.debug("BatchProcessorInstrumentation init");
    return module;
  }

  private _getPatchedProcessRecordFunction() {
    const instrumentation = this;
    const tracer = trace.getTracer("aws-lambda-powertools-batch");
    diag.debug(
      "BatchProcessorInstrumentation _getPatchedProcessRecordFunction"
    );
    return (original: Function) => {
      return async function patchedProcessRecord(this: any, record: any) {
        // Determine the event source type (SQS, Kinesis, DynamoDB)
        diag.debug("BatchProcessorInstrumentation patchedProcessRecord");
        let eventSourceType = "unknown";
        let messageId = undefined;
        let spanLinks: Link[] = [];

        // Extract event source type and message ID based on record structure
        if (
          record.eventSource === "aws:sqs" ||
          (this.eventType && this.eventType === "SQS")
        ) {
          eventSourceType = "sqs";
          messageId = record.messageId;

          // Extract context from SQS message attributes if enabled
          if (
            instrumentation["_config"].enableSqsContextExtraction &&
            record.messageAttributes
          ) {
            try {
              // Convert SQS message attributes to a format suitable for context extraction
              const extractableAttributes: Attributes = {};
              Object.keys(record.messageAttributes || {}).forEach((key) => {
                if (record.messageAttributes[key].dataType === "String") {
                  extractableAttributes[key] =
                    record.messageAttributes[key].stringValue;
                }
              });

              // Extract propagated context
              const ctx = propagation.extract(
                ROOT_CONTEXT,
                extractableAttributes
              );
              const spanContext = trace.getSpanContext(ctx);

              if (spanContext) {
                spanLinks.push({
                  context: spanContext,
                  attributes: { [ATTR_MESSAGING_MESSAGE_ID]: messageId },
                });
              }
            } catch (error) {
              instrumentation._diag.error(
                "Failed to extract context from SQS message",
                error
              );
            }
          }
        } else if (
          record.eventSource === "aws:kinesis" ||
          (this.eventType && this.eventType === "KinesisDataStreams")
        ) {
          eventSourceType = "kinesis";
          messageId = record.kinesis?.sequenceNumber;
        } else if (
          record.eventSource === "aws:dynamodb" ||
          (this.eventType && this.eventType === "DynamoDBStreams")
        ) {
          eventSourceType = "dynamodb";
          messageId = record.dynamodb?.SequenceNumber;
        }

        // Create attributes for the span
        const attributes: Attributes = {
          [ATTR_MESSAGING_SYSTEM]: eventSourceType,
          [ATTR_MESSAGING_OPERATION_NAME]: "process",
        };

        if (messageId) {
          attributes[ATTR_MESSAGING_MESSAGE_ID] = messageId;
        }

        // Start a new span for this record processing
        return tracer.startActiveSpan(
          `${eventSourceType}.process`,
          {
            kind: SpanKind.CONSUMER,
            attributes,
            links: spanLinks.length > 0 ? spanLinks : undefined,
          },
          async (span) => {
            // Call the recordHook if provided
            const { recordHook } = instrumentation.getConfig();
            if (recordHook) {
              safeExecuteInTheMiddle(
                () => recordHook(span, record),
                (err) => {
                  if (err) {
                    instrumentation._diag.error(
                      "Error executing recordHook",
                      err
                    );
                  }
                },
                true
              );
            }

            try {
              // Call the original processRecord method and capture its result
              const result = await original.apply(this, [record]);
              return result;
            } catch (error) {
              // Record the error in the span
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message:
                  error instanceof Error ? error.message : "Unknown error",
              });
              span.recordException(error as Error);

              // Re-throw the error
              throw error;
            } finally {
              // End the span
              span.end();
            }
          }
        );
      };
    };
  }
}

// Create and export a singleton instance for convenience
export const batchProcessorInstrumentation =
  new BatchProcessorInstrumentation();
