import { APIGatewayEvent, APIGatewayEventRequestContextV2, APIGatewayProxyEvent, APIGatewayProxyEventV2WithRequestContext } from "aws-lambda"

type SupportedEvents = APIGatewayProxyEvent | APIGatewayProxyEventV2WithRequestContext<any>

const getRequestIdentifier = (event: SupportedEvents) => {
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
    return undefined;
}