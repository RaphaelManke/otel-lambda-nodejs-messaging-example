import {
  BatchProcessor,
  EventType,
  processPartialResponse,
} from "@aws-lambda-powertools/batch";
import { Logger } from "@aws-lambda-powertools/logger";
import type { SQSHandler, SQSRecord } from "aws-lambda";
import { OtelLogFormatter } from "../../../patches/powertools/otel-log-formatter";

const processor = new BatchProcessor(EventType.SQS);
const logger = new Logger({
  logFormatter: new OtelLogFormatter(),
});

const recordHandler = async (record: SQSRecord): Promise<void> => {
  // Process the record
  const payload = record.body;
  if (payload) {
    const item = JSON.parse(payload);
    logger.info("Processed item", { item });
    await fetch("https://httpbin.org/post", {
      method: "POST",
      body: JSON.stringify(item),
    });
  }
};

export const handler: SQSHandler = async (event, context) => {
  return await processPartialResponse(event, recordHandler, processor, {
    context,
  });
};
