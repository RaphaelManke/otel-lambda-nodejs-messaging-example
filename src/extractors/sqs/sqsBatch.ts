import { Attributes } from "@opentelemetry/api";
import {
  ATTR_CLOUD_REGION,
  ATTR_MESSAGING_BATCH_MESSAGE_COUNT,
  ATTR_MESSAGING_DESTINATION_NAME,
  ATTR_MESSAGING_DESTINATION_SUBSCRIPTION_NAME,
  ATTR_MESSAGING_MESSAGE_ID,
  ATTR_MESSAGING_OPERATION_NAME,
  ATTR_MESSAGING_OPERATION_TYPE,
  ATTR_MESSAGING_SYSTEM,
  MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
  MESSAGING_OPERATION_TYPE_VALUE_RECEIVE,
  MESSAGING_SYSTEM_VALUE_AWS_SQS,
} from "@opentelemetry/semantic-conventions/incubating";
import type { SQSEvent, SQSRecord } from "aws-lambda";

/**
 *
 * @param record
 * @example  {
            "messageId": "2e1424d4-f796-459a-8184-9c92662be6da",
            "receiptHandle": "AQEBzWwaftRI0KuVm4tP+/7q1rGgNqicHq...",
            "body": "Test message.",
            "attributes": {
                "ApproximateReceiveCount": "1",
                "SentTimestamp": "1545082650636",
                "SenderId": "AIDAIENQZJOLO23YVJ4VO",
                "ApproximateFirstReceiveTimestamp": "1545082650649"
            },
            "messageAttributes": {},
            "md5OfBody": "e4e68fb7bd0e697a0ae8f1bb342846b3",
            "eventSource": "aws:sqs",
            "eventSourceARN": "arn:aws:sqs:us-east-2:123456789012:my-queue",
            "awsRegion": "us-east-2"
        }
 * @returns
 */
export const extractOpenTelemetrySemanticSpanAttributesFromSQSRecord = (
  record: SQSRecord
): Attributes => {
  return {
    [ATTR_MESSAGING_MESSAGE_ID]: record.messageId,
    [ATTR_MESSAGING_OPERATION_NAME]: "process record",
    [ATTR_MESSAGING_OPERATION_TYPE]: MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
    [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_AWS_SQS,
    [ATTR_MESSAGING_DESTINATION_SUBSCRIPTION_NAME]: record.eventSourceARN,
    [ATTR_MESSAGING_DESTINATION_NAME]: record.eventSourceARN.split(":").pop(),
    [ATTR_CLOUD_REGION]: record.awsRegion,
  };
};
export const extractOpenTelemetrySemanticSpanAttributesFromSQSEvent = (
  record: SQSEvent
): Attributes => {
  return {
    [ATTR_MESSAGING_OPERATION_NAME]: "poll",
    [ATTR_MESSAGING_OPERATION_TYPE]: MESSAGING_OPERATION_TYPE_VALUE_RECEIVE,
    [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_AWS_SQS,
    [ATTR_MESSAGING_BATCH_MESSAGE_COUNT]: record.Records.length,
  };
};
export const convertSqsMessageAttributesToObject = (
  messageAttributes: SQSRecord["messageAttributes"]
): Record<string, string> => {
  return Object.entries(messageAttributes).reduce((acc, [key, value]) => {
    if (value.stringValue) {
      acc[key] = value.stringValue;
    }
    return acc;
  }, {} as Record<string, string>);
};

export const extractSqsBatchSpanName = (event: SQSEvent): string => {
  return `poll ${event.Records[0].eventSourceARN.split(":").pop()!}`;
};
