import {
    BatchProcessor,
    EventType,
    processPartialResponse
} from '@aws-lambda-powertools/batch';
import { LogFormatter, Logger, LogItem } from '@aws-lambda-powertools/logger';
import type { LogAttributes, UnformattedAttributes } from '@aws-lambda-powertools/logger/types';
import { Attributes, Link, propagation, ROOT_CONTEXT, SpanKind, trace } from '@opentelemetry/api';
import { ATTR_CLOUD_REGION, ATTR_MESSAGING_BATCH_MESSAGE_COUNT, ATTR_MESSAGING_DESTINATION_NAME, ATTR_MESSAGING_DESTINATION_SUBSCRIPTION_NAME, ATTR_MESSAGING_MESSAGE_ID, ATTR_MESSAGING_OPERATION_NAME, ATTR_MESSAGING_OPERATION_TYPE, ATTR_MESSAGING_SYSTEM } from '@opentelemetry/semantic-conventions/incubating';
import type { SQSEvent, SQSHandler, SQSRecord } from 'aws-lambda';

const convertLogLevelNameToOpentelemetrySeverityNumber = (logLevel: string): number => {

    /*
    * OpenTelemetry Severity Number
    severityNumber	Short Name
    1	TRACE
    2	TRACE2
    3	TRACE3
    4	TRACE4
    5	DEBUG
    6	DEBUG2
    7	DEBUG3
    8	DEBUG4
    9	INFO
    10	INFO2
    11	INFO3
    12	INFO4
    13	WARN
    14	WARN2
    15	WARN3
    16	WARN4
    17	ERROR
    18	ERROR2
    19	ERROR3
    20	ERROR4
    21	FATAL
    22	FATAL2
    23	FATAL3
    24	FATAL4
    */
    switch (logLevel.toUpperCase()) {
        case 'TRACE':
            return 1;
        case 'DEBUG':
            return 5;
        case 'INFO':
            return 9;
        case 'WARN':
            return 13;
        case 'ERROR':
            return 17;
        case 'FATAL':
            return 21;
        default:
            return 9;


    }
}


class OtelLogFormatter extends LogFormatter {
    public formatAttributes(
        attributes: UnformattedAttributes,
        additionalLogAttributes: LogAttributes
    ): LogItem {


        const logItem = new LogItem({
            attributes: {
                ...attributes,
                // TODO: Loglevel is not detected by the logger
                severityText: attributes.logLevel.toUpperCase(),
                severityNumber: convertLogLevelNameToOpentelemetrySeverityNumber(attributes.logLevel).toString(),
            }
        });
        logItem.addAttributes(additionalLogAttributes); // add any attributes not explicitly defined
        const ctx = trace.getActiveSpan()?.spanContext()
        if (ctx) {
            logItem.addAttributes({
                traceId: ctx.traceId,
                spanId: ctx.spanId,
                traceFlags: ctx.traceFlags,
                traceState: ctx.traceState,
            });
        }

        return logItem;
    }
}

const processor = new BatchProcessor(EventType.SQS);
const logger = new Logger({
    logFormatter: new OtelLogFormatter(),

});

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
const extractOpenTelemetrySemanticSpanAttributesFromSQSRecord = (record: SQSRecord): Attributes => {
    return {
        [ATTR_MESSAGING_MESSAGE_ID]: record.messageId,
        [ATTR_MESSAGING_OPERATION_NAME]: "process",
        [ATTR_MESSAGING_OPERATION_TYPE]: "process",
        [ATTR_MESSAGING_SYSTEM]: "aws_sqs",
        [ATTR_MESSAGING_DESTINATION_SUBSCRIPTION_NAME]: record.eventSourceARN,
        [ATTR_MESSAGING_DESTINATION_NAME]: record.eventSourceARN.split(":").pop(),
        [ATTR_CLOUD_REGION]: record.awsRegion,

    }
}

const extractOpenTelemetrySemanticSpanAttributesFromSQSEvent = (record: SQSEvent): Attributes => {
    return {
        [ATTR_MESSAGING_OPERATION_NAME]: "receive",
        [ATTR_MESSAGING_OPERATION_TYPE]: "receive",
        [ATTR_MESSAGING_SYSTEM]: "aws_sqs",
        [ATTR_MESSAGING_BATCH_MESSAGE_COUNT]: record.Records.length,

    }
}

const convertSqsMessageAttributesToObject = (messageAttributes: SQSRecord['messageAttributes']): Record<string, string> => {
    return Object.entries(messageAttributes).reduce((acc, [key, value]) => {
        if (value.stringValue) {
            acc[key] = value.stringValue;
        }
        return acc;
    }, {} as Record<string, string>);
}

const tracer = trace.getTracer('recordHandler');
const recordHandler = async (record: SQSRecord): Promise<void> => {
    const convertedMessageAttributes = convertSqsMessageAttributesToObject(record.messageAttributes);
    logger.info('Processing record', { messageAttribtes: record.messageAttributes, convertedMessageAttributes });
    // OpenTelemetry instrumentation - 
    // https://opentelemetry.io/docs/specs/semconv/faas/aws-lambda/#sqs-lambda-tracing-passive  
    // https://github.com/open-telemetry/opentelemetry-js-contrib/pull/2345/files
    // https://github.com/open-telemetry/opentelemetry-js-contrib/blob/instrumentation-aws-sdk-v0.47.0/plugins/node/opentelemetry-instrumentation-aws-sdk/doc/sqs.md#receivemessage
    const ctx = propagation.extract(ROOT_CONTEXT, convertedMessageAttributes)
    const spanContext = trace.getSpanContext(ctx)
    const spanLinks: Link[] = []
    if (spanContext) {
        spanLinks.push({ context: spanContext, attributes: { [ATTR_MESSAGING_MESSAGE_ID]: record.messageId } })
    }
    return tracer.startActiveSpan('process', {
        kind: SpanKind.CONSUMER,
        attributes: extractOpenTelemetrySemanticSpanAttributesFromSQSRecord(record),
        links: spanLinks
    }, (span) => {

        try {
            // Process the record
            const payload = record.body;
            if (payload) {
                const item = JSON.parse(payload);
                logger.info('Processed item', { item });
            }

        } catch (error) {
            span.setStatus({
                code: 2,
                message: (error as Error).message
            })
            throw error
        } finally {
            span.setStatus({
                code: 0,
            })
            span.end()
        }

    });
};

export const handler: SQSHandler = async (event, context) => {
    trace.getActiveSpan()?.setAttributes(extractOpenTelemetrySemanticSpanAttributesFromSQSEvent(event))
    return await processPartialResponse(event, recordHandler, processor, {
        context,
    });
}







