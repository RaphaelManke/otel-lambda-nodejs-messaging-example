import { BatchProcessor, EventType } from "@aws-lambda-powertools/batch";
import { BaseRecord } from "@aws-lambda-powertools/batch/types";
import {
  propagation,
  ROOT_CONTEXT,
  Link,
  SpanKind,
  trace,
} from "@opentelemetry/api";
import { ATTR_MESSAGING_MESSAGE_ID } from "@opentelemetry/semantic-conventions/incubating";
import { SQSRecord } from "aws-lambda";
import {
  convertSqsMessageAttributesToObject,
  extractOpenTelemetrySemanticSpanAttributesFromSQSRecord,
} from "../../extractors/sqs/sqsBatch";

export class InstrumentedBatchProcessor extends BatchProcessor {
  public constructor(eventType: keyof typeof EventType) {
    super(eventType);
  }
  public override async processRecord(event: BaseRecord) {
    const tracer = trace.getTracer("recordHandler");
    const record = event as SQSRecord;
    const convertedMessageAttributes = convertSqsMessageAttributesToObject(
      record.messageAttributes
    );
    // OpenTelemetry instrumentation -
    // https://opentelemetry.io/docs/specs/semconv/faas/aws-lambda/#sqs-lambda-tracing-passive
    // https://github.com/open-telemetry/opentelemetry-js-contrib/pull/2345/files
    // https://github.com/open-telemetry/opentelemetry-js-contrib/blob/instrumentation-aws-sdk-v0.47.0/plugins/node/opentelemetry-instrumentation-aws-sdk/doc/sqs.md#receivemessage
    const ctx = propagation.extract(ROOT_CONTEXT, convertedMessageAttributes);
    const spanContext = trace.getSpanContext(ctx);
    const spanLinks: Link[] = [];
    if (spanContext) {
      spanLinks.push({
        context: spanContext,
        attributes: { [ATTR_MESSAGING_MESSAGE_ID]: record.messageId },
      });
    }
    return tracer.startActiveSpan(
      "process",
      {
        kind: SpanKind.CONSUMER,
        attributes:
          extractOpenTelemetrySemanticSpanAttributesFromSQSRecord(record),
        links: spanLinks,
      },
      async (span) => {
        try {
          return await super.processRecord(event);
        } catch (error) {
          span.setStatus({
            code: 2,
            message: (error as Error).message,
          });
          throw error;
        } finally {
          span.end();
        }
      }
    );
  }
}
