import { Module } from "@nestjs/common";
import { SchedulingController } from "./scheduling.controller.ts";
import { SchedulingService } from "./scheduling.service.ts";

@Module({
  controllers: [SchedulingController],
  providers: [SchedulingService],
})
export class SchedulingModule {}
