import { Module } from "@nestjs/common";
import { PatientAppController } from "./patient-app.controller.ts";
import { PatientAppService } from "./patient-app.service.ts";

@Module({
  controllers: [PatientAppController],
  providers: [PatientAppService],
})
export class PatientAppModule {}
