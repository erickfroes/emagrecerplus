import { Module } from "@nestjs/common";
import { AppController } from "./app.controller.ts";
import { AuthModule } from "./modules/auth/auth.module.ts";
import { ClinicalModule } from "./modules/clinical/clinical.module.ts";
import { CrmModule } from "./modules/crm/crm.module.ts";
import { DashboardModule } from "./modules/dashboard/dashboard.module.ts";
import { PatientsModule } from "./modules/patients/patients.module.ts";
import { SchedulingModule } from "./modules/scheduling/scheduling.module.ts";
import { PrismaModule } from "./prisma/prisma.module.ts";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    DashboardModule,
    PatientsModule,
    SchedulingModule,
    CrmModule,
    ClinicalModule,
  ],
  controllers: [AppController],
})
export class AppModule {}