import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AppController } from "./app.controller.ts";
import { AuthModule } from "./modules/auth/auth.module.ts";
import { AppAuthGuard } from "./modules/auth/app-auth.guard.ts";
import { ClinicalModule } from "./modules/clinical/clinical.module.ts";
import { CrmModule } from "./modules/crm/crm.module.ts";
import { DashboardModule } from "./modules/dashboard/dashboard.module.ts";
import { PatientAppModule } from "./modules/patient-app/patient-app.module.ts";
import { PatientsModule } from "./modules/patients/patients.module.ts";
import { NotificationsModule } from "./modules/notifications/notifications.module.ts";
import { SchedulingModule } from "./modules/scheduling/scheduling.module.ts";
import { SettingsModule } from "./modules/settings/settings.module.ts";
import { PrismaModule } from "./prisma/prisma.module.ts";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    DashboardModule,
    PatientAppModule,
    PatientsModule,
    SchedulingModule,
    CrmModule,
    ClinicalModule,
    NotificationsModule,
    SettingsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AppAuthGuard,
    },
  ],
})
export class AppModule {}
