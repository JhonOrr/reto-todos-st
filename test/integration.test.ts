const mockDynamoSend = jest.fn();
const mockCloudWatchSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn(),
}));

jest.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: jest.fn(() => ({
    send: mockCloudWatchSend,
  })),
  PutMetricDataCommand: jest.fn(),
}));

jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: mockDynamoSend,
    })),
  },
  GetCommand: jest.fn(),
  PutCommand: jest.fn(),
  UpdateCommand: jest.fn(),
  DeleteCommand: jest.fn(),
  ScanCommand: jest.fn(),
}));

import { main } from "../src/handler";
import { APIGatewayProxyEvent } from "aws-lambda";

describe("Todo API Integration Tests", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = process.env;
    process.env.TODOS_TABLE = "integration-test-table";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const createMockEvent = (
    method: string,
    path: string,
    body?: any,
    pathParameters?: any
  ): APIGatewayProxyEvent => ({
    httpMethod: method,
    path,
    body: body ? JSON.stringify(body) : null,
    pathParameters,
    headers: { "Content-Type": "application/json" },
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    stageVariables: null,
    requestContext: {
      requestId: "test-request-id",
      stage: "test",
      resourceId: "test-resource",
      httpMethod: method,
      resourcePath: path,
      path: `/test${path}`,
      accountId: "123456789012",
      apiId: "test-api-id",
      protocol: "HTTP/1.1",
      requestTime: "09/Apr/2015:12:34:56 +0000",
      requestTimeEpoch: 1428582896000,
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: "127.0.0.1",
        user: null,
        userAgent: "Custom User Agent String",
        userArn: null,
        clientCert: null,
      },
      authorizer: null,
    },
    resource: path,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Complete CRUD workflow", () => {
    it("should handle complete todo lifecycle", async () => {
      mockDynamoSend
        .mockResolvedValueOnce({}) // Create
        .mockResolvedValueOnce({
          Item: {
            todoId: "test-id",
            title: "Integration Test Todo",
            description: "Test description",
            completed: false,
            createdAt: "2023-01-01T00:00:00.000Z",
            updatedAt: "2023-01-01T00:00:00.000Z",
          },
        })
        .mockResolvedValueOnce({
          Attributes: {
            todoId: "test-id",
            title: "Updated Integration Test Todo",
            description: "Updated description",
            completed: true,
            createdAt: "2023-01-01T00:00:00.000Z",
            updatedAt: "2023-01-01T01:00:00.000Z",
          },
        })
        .mockResolvedValueOnce({}); // Delete

      mockCloudWatchSend.mockResolvedValue({});

      const createEvent = createMockEvent("POST", "/todos", {
        title: "Integration Test Todo",
        description: "Test description",
      });

      const createResult = await main(createEvent);
      expect(createResult.statusCode).toBe(201);

      const createdTodo = JSON.parse(createResult.body);
      expect(createdTodo.title).toBe("Integration Test Todo");
      expect(createdTodo.completed).toBe(false);

      const getEvent = createMockEvent("GET", "/todos/test-id", null, {
        id: "test-id",
      });
      const getResult = await main(getEvent);
      expect(getResult.statusCode).toBe(200);

      const retrievedTodo = JSON.parse(getResult.body);
      expect(retrievedTodo.todoId).toBe("test-id");
      expect(retrievedTodo.title).toBe("Integration Test Todo");

      const updateEvent = createMockEvent(
        "PUT",
        "/todos/test-id",
        {
          title: "Updated Integration Test Todo",
          completed: true,
        },
        { id: "test-id" }
      );

      const updateResult = await main(updateEvent);
      expect(updateResult.statusCode).toBe(200);

      const updatedTodo = JSON.parse(updateResult.body);
      expect(updatedTodo.title).toBe("Updated Integration Test Todo");
      expect(updatedTodo.completed).toBe(true);

      const deleteEvent = createMockEvent("DELETE", "/todos/test-id", null, {
        id: "test-id",
      });
      const deleteResult = await main(deleteEvent);
      expect(deleteResult.statusCode).toBe(204);
    });

    it("should handle list todos operation", async () => {
      const mockTodos = [
        {
          todoId: "1",
          title: "First Todo",
          completed: false,
          createdAt: "2023-01-01T00:00:00.000Z",
          updatedAt: "2023-01-01T00:00:00.000Z",
        },
        {
          todoId: "2",
          title: "Second Todo",
          completed: true,
          createdAt: "2023-01-01T01:00:00.000Z",
          updatedAt: "2023-01-01T01:00:00.000Z",
        },
      ];

      mockDynamoSend.mockResolvedValue({ Items: mockTodos });

      const listEvent = createMockEvent("GET", "/todos");
      const result = await main(listEvent);

      expect(result.statusCode).toBe(200);
      const response = JSON.parse(result.body);
      expect(response.todos).toHaveLength(2);
      expect(response.todos[0].todoId).toBe("1");
      expect(response.todos[1].todoId).toBe("2");
    });
  });

  describe("Error scenarios", () => {
    it("should handle DynamoDB errors gracefully", async () => {
      mockDynamoSend.mockRejectedValue(new Error("DynamoDB connection failed"));

      const event = createMockEvent("GET", "/todos");
      const result = await main(event);

      expect(result.statusCode).toBe(500);
      const response = JSON.parse(result.body);
      expect(response.error).toBe("Internal server error");
    });

    it("should handle malformed JSON in request body", async () => {
      const event = createMockEvent("POST", "/todos");
      event.body = "{ invalid json }";

      const result = await main(event);
      expect(result.statusCode).toBe(500);
    });
  });
});
