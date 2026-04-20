import { Module } from "@nestjs/common";
import { CrmController } from "./crm.controller.ts";
import { CrmService } from "./crm.service.ts";

@Module({
  controllers: [CrmController],
  providers: [CrmService],
})
export class CrmModule {}
