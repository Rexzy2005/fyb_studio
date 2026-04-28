import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./app-error";

type RouteHandler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;

export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof AppError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message, details: err.details } },
          { status: err.statusCode }
        );
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid input",
              details: err.flatten().fieldErrors,
            },
          },
          { status: 422 }
        );
      }

      console.error("[api] unhandled error:", err);
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Something went wrong" } },
        { status: 500 }
      );
    }
  };
}
