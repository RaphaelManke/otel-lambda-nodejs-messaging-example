import { Attributes } from "@opentelemetry/api";
import {
    ATTR_CLIENT_ADDRESS,
    ATTR_CLIENT_PORT,
    ATTR_HTTP_REQUEST_HEADER,
    ATTR_HTTP_REQUEST_METHOD,
    ATTR_HTTP_RESPONSE_STATUS_CODE,
    ATTR_HTTP_ROUTE,
    ATTR_NETWORK_PROTOCOL_NAME,
    ATTR_NETWORK_PROTOCOL_VERSION,
    ATTR_NETWORK_TRANSPORT,
    ATTR_SERVER_ADDRESS,
    ATTR_SERVER_PORT,
    ATTR_URL_PATH,
    ATTR_URL_QUERY,
    ATTR_URL_SCHEME,
    ATTR_USER_AGENT_ORIGINAL,
    HTTP_REQUEST_METHOD_VALUE_CONNECT,
    HTTP_REQUEST_METHOD_VALUE_DELETE,
    HTTP_REQUEST_METHOD_VALUE_GET,
    HTTP_REQUEST_METHOD_VALUE_HEAD,
    HTTP_REQUEST_METHOD_VALUE_OPTIONS,
    HTTP_REQUEST_METHOD_VALUE_OTHER,
    HTTP_REQUEST_METHOD_VALUE_PATCH,
    HTTP_REQUEST_METHOD_VALUE_POST,
    HTTP_REQUEST_METHOD_VALUE_PUT,
    HTTP_REQUEST_METHOD_VALUE_TRACE,
    NETWORK_TRANSPORT_VALUE_TCP
} from '@opentelemetry/semantic-conventions';
import { ATTR_HTTP_REQUEST_BODY_SIZE, ATTR_HTTP_REQUEST_SIZE, ATTR_HTTP_RESPONSE_BODY_SIZE, ATTR_HTTP_RESPONSE_SIZE } from "@opentelemetry/semantic-conventions/incubating";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export const extractApigatewayV1SpanName = (event: APIGatewayProxyEvent): string => {
    return `${mapHttpMethodToSemanticConvention(event.httpMethod)} ${mapHttpRouteToSemanticConvention(event.requestContext.resourcePath)}`
}
// https://opentelemetry.io/docs/specs/semconv/http/http-spans/#http-server-semantic-conventions
export const extractApigatewayV1RequestAttributes = (event: APIGatewayProxyEvent): Attributes => {
    return {
        // Required attributes
        [ATTR_HTTP_REQUEST_METHOD]: mapHttpMethodToSemanticConvention(event.httpMethod),
        [ATTR_URL_PATH]: event.path,
        [ATTR_URL_SCHEME]: event.headers["X-Forwarded-Proto"],

        // Conditionally Required
        // [ATTR_ERROR_TYPE]: "",
        // [ATTR_HTTP_REQUEST_METHOD_ORIGINAL]: "",
        [ATTR_HTTP_ROUTE]: mapHttpRouteToSemanticConvention(event.requestContext.resourcePath),
        [ATTR_NETWORK_PROTOCOL_NAME]: "http",
        [ATTR_SERVER_PORT]: event.headers["X-Forwarded-Port"],
        [ATTR_URL_QUERY]: mapUrlQueryToSemanticConvention(event.multiValueQueryStringParameters),

        // Recommended
        [ATTR_CLIENT_ADDRESS]: event.requestContext.identity.sourceIp, // PII
        // [ATTR_NETWORK_PEER_ADDRESS]: "", // PII
        // [ATTR_NETWORK_PEER_PORT]: "", // PII
        [ATTR_NETWORK_PROTOCOL_VERSION]: extractNetworkProtocolVersion(event.requestContext.protocol),
        [ATTR_SERVER_ADDRESS]: event.requestContext.domainName,
        [ATTR_USER_AGENT_ORIGINAL]: event.headers["User-Agent"],

        // Opt-In
        [ATTR_CLIENT_PORT]: event.headers["X-Forwarded-Port"],
        [ATTR_HTTP_REQUEST_BODY_SIZE]: calculateStringSizeInBytes(event.body),
        ...extractHeaders(event.multiValueHeaders),
        [ATTR_HTTP_REQUEST_SIZE]: calculateStringSizeInBytes(JSON.stringify(event)),
        // [ATTR_NETWORK_LOCAL_ADDRESS]: ""
        [ATTR_NETWORK_TRANSPORT]: NETWORK_TRANSPORT_VALUE_TCP,
        // [ATTR_USER_AGENT_SYNTHETIC_TYPE]: ""
    }
}

export const extractApigatewayV1ResponseAttributes = (response: APIGatewayProxyResult): Attributes => {
    return {
        // Conditionally Required
        [ATTR_HTTP_RESPONSE_STATUS_CODE]: response.statusCode,

        // Opt-In
        [ATTR_HTTP_RESPONSE_BODY_SIZE]: calculateStringSizeInBytes(response.body),
        ...extractHeaders(response.multiValueHeaders),
        [ATTR_HTTP_RESPONSE_SIZE]: calculateStringSizeInBytes(JSON.stringify(response)),
    }
}


// [ATTR_HTTP_RESPONSE_STATUS_CODE]: "",
const REDACTED_QUERY_PARAMS = [
    "AWSAccessKeyId",
    "Signature",
    "sig",
    "X-Goog-Signature"
]
// TODO: Add tests
const mapUrlQueryToSemanticConvention = (urlQuery: APIGatewayProxyEvent["multiValueQueryStringParameters"]): string | undefined => {
    if (!urlQuery) {
        return
    }

    const values = Object.entries(urlQuery).flatMap(([key, value]) =>
        value?.map(v => {
            if (REDACTED_QUERY_PARAMS.includes(key)) {
                return [key, "REDACTED"]
            }
            return [key, v]
        }) || []
    );

    return new URLSearchParams(values).toString()
}

const mapHttpRouteToSemanticConvention = (httpRoute: string): string => {
    const routeSegments = httpRoute.split('/')
    const normalizedRouteSEgments = routeSegments.map((r) => {
        if (r.startsWith('{') && r.endsWith('}')) {
            return ':' + r.slice(1, -1)
        }
        return r
    }
    )
    return normalizedRouteSEgments.join('/')
}

const mapHttpMethodToSemanticConvention = (httpMethod: string): string => {
    switch (httpMethod.toUpperCase()) {
        case 'GET':
            return HTTP_REQUEST_METHOD_VALUE_GET
        case 'POST':
            return HTTP_REQUEST_METHOD_VALUE_POST
        case 'PUT':
            return HTTP_REQUEST_METHOD_VALUE_PUT
        case 'DELETE':
            return HTTP_REQUEST_METHOD_VALUE_DELETE
        case 'PATCH':
            return HTTP_REQUEST_METHOD_VALUE_PATCH
        case 'HEAD':
            return HTTP_REQUEST_METHOD_VALUE_HEAD
        case 'OPTIONS':
            return HTTP_REQUEST_METHOD_VALUE_OPTIONS
        case 'CONNECT':
            return HTTP_REQUEST_METHOD_VALUE_CONNECT
        case 'TRACE':
            return HTTP_REQUEST_METHOD_VALUE_TRACE
        default:
            return HTTP_REQUEST_METHOD_VALUE_OTHER
    }
}

const extractNetworkProtocolVersion = (protocol: string): string => {
    return protocol.split('/')[1]
}

const calculateStringSizeInBytes = (body: string | null): number => {
    if (!body) {
        return 0
    }
    return Buffer.byteLength(body)
}

const extractHeaders = (headers?: APIGatewayProxyEvent["multiValueHeaders"] | APIGatewayProxyResult["multiValueHeaders"]): Attributes => {
    if (!headers) {
        return {}
    }
    // TODO: Make it configurable because some headers might contain sensitive information
    const headerValues = Object.entries(headers).reduce((acc, [key, value]) => {
        const semanticHeaderName = ATTR_HTTP_REQUEST_HEADER(key.toLowerCase())
        acc[semanticHeaderName] = value?.toString()
        return acc
    }
        , {} as Attributes)
    return headerValues
}