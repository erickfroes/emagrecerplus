import { Controller, Get } from "@nestjs/common";
import { Public } from "./common/auth/public.decorator.ts";

@Public()
@Controller()
export class AppController {
  @Get()
  getRoot() {
    return {
      name: "EmagrecePlus API",
      status: "ok",
    };
  }

  @Get("health")
  getHealth() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }
}
