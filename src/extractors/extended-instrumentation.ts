import { Span, trace } from "@opentelemetry/api";
import {
  extractApigatewayV1RequestAttributes,
  extractApigatewayV1ResponseAttributes,
  extractApigatewayV1SpanName,
} from "./apigateway/restApiV1";
import { getRequestIdentifier } from "./requestIdentifier";
import {
  extractOpenTelemetrySemanticSpanAttributesFromSQSEvent,
  extractSqsBatchSpanName,
} from "./sqs/sqsBatch";

export const preRequestHook = (span: Span, event: any) => {
  const eventType = getRequestIdentifier(event);
  if (eventType === "APIGatewayProxyEventV1Http") {
    span
      .setAttributes(extractApigatewayV1RequestAttributes(event))
      .updateName(extractApigatewayV1SpanName(event));
    return;
  }
  if (eventType === "SQSEvent") {
    span
      .setAttributes(
        extractOpenTelemetrySemanticSpanAttributesFromSQSEvent(event)
      )
      .updateName(extractSqsBatchSpanName(event));
  }
};

export const postRequestHook = (
  span: Span,
  responseType: ReturnType<typeof getRequestIdentifier>,
  payload: any
) => {
  if (responseType === "APIGatewayProxyEventV1Http") {
    span.setAttributes(extractApigatewayV1ResponseAttributes(payload));
    return;
  }
};
