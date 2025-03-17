import { LogFormatter, LogItem } from "@aws-lambda-powertools/logger";
import {
  UnformattedAttributes,
  LogAttributes,
} from "@aws-lambda-powertools/logger/types";
import { trace } from "@opentelemetry/api";

export class OtelLogFormatter extends LogFormatter {
  public formatAttributes(
    attributes: UnformattedAttributes,
    additionalLogAttributes: LogAttributes
  ): LogItem {
    const logItem = new LogItem({
      attributes: {
        ...attributes,
        // TODO: Loglevel is not detected by the logger
        level: attributes.logLevel.toUpperCase(),
      },
    });
    logItem.addAttributes(additionalLogAttributes); // add any attributes not explicitly defined
    const ctx = trace.getActiveSpan()?.spanContext();
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
