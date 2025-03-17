import {
  EventType,
  processPartialResponse,
} from "@aws-lambda-powertools/batch";
import { Logger } from "@aws-lambda-powertools/logger";
import { trace } from "@opentelemetry/api";
import type { SQSHandler, SQSRecord } from "aws-lambda";
import { extractOpenTelemetrySemanticSpanAttributesFromSQSEvent } from "../../../extractors/sqs/sqsBatch";
import { InstrumentedBatchProcessor } from "../../../patches/powertools/instrumented-batch-processor";
import { OtelLogFormatter } from "../../../patches/powertools/otel-log-formatter";

const processor = new InstrumentedBatchProcessor(EventType.SQS);
const logger = new Logger({
  logFormatter: new OtelLogFormatter(),
});

const recordHandler = async (record: SQSRecord): Promise<void> => {
  // Process the record
  const payload = record.body;
  if (payload) {
    const item = JSON.parse(payload);
    logger.info("Processed item", { item });
  }
};

export const handler: SQSHandler = async (event, context) => {
  trace
    .getActiveSpan()
    ?.setAttributes(
      extractOpenTelemetrySemanticSpanAttributesFromSQSEvent(event)
    );
  return await processPartialResponse(event, recordHandler, processor, {
    context,
  });
};
