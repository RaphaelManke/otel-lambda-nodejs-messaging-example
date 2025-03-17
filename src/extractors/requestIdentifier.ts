import {
  APIGatewayEvent,
  APIGatewayEventRequestContextV2,
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2WithRequestContext,
  SQSEvent,
} from "aws-lambda";

type SupportedEvents =
  | APIGatewayProxyEvent
  | APIGatewayProxyEventV2WithRequestContext<any>
  | SQSEvent;

export const getRequestIdentifier = (event: SupportedEvents) => {
  if ("requestContext" in event) {
    if ("httpMethod" in event) {
      return "APIGatewayProxyEventV1Http";
    }
    if ("http" in event.requestContext) {
      return "APIGatewayProxyEventV2Http";
    }
    if ("connectionId" in event.requestContext) {
      return "APIGatewayProxyEventV2WebSocket";
    }
  }
  if (
    "Records" in event &&
    event.Records.length > 0 &&
    "eventSource" in event.Records[0]
  ) {
    {
      if (event.Records[0].eventSource === "aws:sqs") {
        return "SQSEvent";
      }
    }
  }
  return undefined;
};
