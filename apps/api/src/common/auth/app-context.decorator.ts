import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type {
  AppRequestContext,
  RequestWithAppSession,
} from "./app-session.ts";

export const AppContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AppRequestContext | undefined => {
    const request = context.switchToHttp().getRequest<RequestWithAppSession>();
    return request.appContext;
  }
);
