import { Module } from "@nestjs/common";
import { ClinicalController } from "./clinical.controller.ts";
import { ClinicalService } from "./clinical.service.ts";

@Module({
  controllers: [ClinicalController],
  providers: [ClinicalService],
  exports: [ClinicalService],
})
export class ClinicalModule {}