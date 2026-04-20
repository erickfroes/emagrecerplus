import { Module } from "@nestjs/common";
import { PatientsController } from "./patients.controller.ts";
import { PatientsService } from "./patients.service.ts";

@Module({
  controllers: [PatientsController],
  providers: [PatientsService],
})
export class PatientsModule {}
