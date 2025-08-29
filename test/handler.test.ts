import { PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";

// Mock AWS SDK
jest.mock("@aws-sdk/client-dynamodb");
jest.mock("@aws-sdk/client-cloudwatch");
jest.mock("@aws-sdk/lib-dynamodb");

const mockDynamoDb = {
  send: jest.fn(),
};

const mockCloudWatch = {
  send: jest.fn(),
};

jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => mockDynamoDb),
  },
  GetCommand: jest.fn(),
  PutCommand: jest.fn(),
  UpdateCommand: jest.fn(),
  DeleteCommand: jest.fn(),
  ScanCommand: jest.fn(),
}));

jest.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: jest.fn(() => mockCloudWatch),
  PutMetricDataCommand: jest.fn(),
}));

import { APIGatewayProxyEvent } from "aws-lambda";
import { main } from "../src/handler";

// Mock environment variables
process.env.TODOS_TABLE = "test-todos-table";

const createEvent = (
  method: string,
  path: string,
  body?: any,
  pathParameters?: any
): APIGatewayProxyEvent => ({
  httpMethod: method,
  path,
  body: body ? JSON.stringify(body) : null,
  pathParameters,
  headers: {},
  multiValueHeaders: {},
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  isBase64Encoded: false,
  stageVariables: null,
  requestContext: {} as any,
  resource: "",
});

describe("Todo Handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /todos", () => {
    it("should create a new todo", async () => {
      mockDynamoDb.send.mockResolvedValue({});
      mockCloudWatch.send.mockResolvedValue({});

      const event = createEvent("POST", "/todos", { title: "Test Todo" });
      const result = await main(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.title).toBe("Test Todo");
      expect(body.todoId).toBeDefined();
      expect(body.completed).toBe(false);
    });

    it("should return 400 when title is missing", async () => {
      const event = createEvent("POST", "/todos", {});
      const result = await main(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("Title is required");
    });

    it("should publish TodoCreatedCount metric to CloudWatch when a todo is created", async () => {
      mockDynamoDb.send.mockResolvedValue({});
      mockCloudWatch.send.mockResolvedValue({});

      const event = createEvent("POST", "/todos", {
        title: "Metric Test Todo",
      });
      const result = await main(event);

      expect(result.statusCode).toBe(201);

      expect(mockCloudWatch.send).toHaveBeenCalled();

      const putMetricMock = PutMetricDataCommand as unknown as jest.Mock;
      expect(putMetricMock).toHaveBeenCalled();

      const putMetricArgs = putMetricMock.mock.calls[0][0];
      expect(putMetricArgs.MetricData[0].MetricName).toBe("TodoCreatedCount");
      expect(putMetricArgs.MetricData[0].Value).toBe(1);
    });
  });

  describe("GET /todos/{id}", () => {
    it("should return a todo by ID", async () => {
      const mockTodo = {
        todoId: "123",
        title: "Test Todo",
        completed: false,
      };

      mockDynamoDb.send.mockResolvedValue({ Item: mockTodo });

      const event = createEvent("GET", "/todos/123", null, { id: "123" });
      const result = await main(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.todoId).toBe("123");
      expect(body.title).toBe("Test Todo");
    });

    it("should return 404 when todo not found", async () => {
      mockDynamoDb.send.mockResolvedValue({});

      const event = createEvent("GET", "/todos/999", null, { id: "999" });
      const result = await main(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("Todo not found");
    });
  });

  describe("GET /todos", () => {
    it("should return list of todos", async () => {
      const mockTodos = [
        { todoId: "1", title: "Todo 1", completed: false },
        { todoId: "2", title: "Todo 2", completed: true },
      ];

      mockDynamoDb.send.mockResolvedValue({ Items: mockTodos });

      const event = createEvent("GET", "/todos");
      const result = await main(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.todos).toHaveLength(2);
      expect(body.todos[0].todoId).toBe("1");
    });
  });

  describe("PUT /todos/{id}", () => {
    it("should update a todo", async () => {
      const updatedTodo = {
        todoId: "123",
        title: "Updated Todo",
        completed: true,
        updatedAt: expect.any(String),
      };

      mockDynamoDb.send.mockResolvedValue({ Attributes: updatedTodo });

      const event = createEvent(
        "PUT",
        "/todos/123",
        { title: "Updated Todo", completed: true },
        { id: "123" }
      );
      const result = await main(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.title).toBe("Updated Todo");
      expect(body.completed).toBe(true);
    });

    it("should return 400 when no fields to update", async () => {
      const event = createEvent("PUT", "/todos/123", {}, { id: "123" });
      const result = await main(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("No valid fields to update");
    });
  });

  describe("DELETE /todos/{id}", () => {
    it("should delete a todo", async () => {
      mockDynamoDb.send.mockResolvedValue({});

      const event = createEvent("DELETE", "/todos/123", null, { id: "123" });
      const result = await main(event);

      expect(result.statusCode).toBe(204);
    });

    it("should return 404 when todo not found for deletion", async () => {
      const error = new Error("Conditional check failed");
      error.name = "ConditionalCheckFailedException";
      mockDynamoDb.send.mockRejectedValue(error);

      const event = createEvent("DELETE", "/todos/999", null, { id: "999" });
      const result = await main(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("Todo not found");
    });
  });

  describe("Error handling", () => {
    it("should handle unsupported HTTP methods", async () => {
      const event = createEvent("PATCH", "/todos");
      const result = await main(event);

      expect(result.statusCode).toBe(405);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("Method not allowed");
    });

    it("should handle internal server errors", async () => {
      mockDynamoDb.send.mockRejectedValue(new Error("Database error"));

      const event = createEvent("GET", "/todos");
      const result = await main(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("Internal server error");
    });
  });
});
