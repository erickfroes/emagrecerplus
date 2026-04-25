import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller.ts";
import { SettingsService } from "./settings.service.ts";

@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
