import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as PrismaClientCtor } from "../../../../generated/prisma/client/client.ts";
import type { PrismaClient as PrismaClientType } from "../../../../generated/prisma/client/internal/class.ts";

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly client: PrismaClientType;

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL nao definida.");
    }

    this.client = new PrismaClientCtor({
      adapter: new PrismaPg(connectionString),
      log: ["warn", "error"],
    }) as PrismaClientType;
  }

  get tenant(): PrismaClientType["tenant"] {
    return this.client.tenant;
  }

  get pipeline(): PrismaClientType["pipeline"] {
    return this.client.pipeline;
  }

  get pipelineStage(): PrismaClientType["pipelineStage"] {
    return this.client.pipelineStage;
  }

  get lead(): PrismaClientType["lead"] {
    return this.client.lead;
  }

  get leadStageHistory(): PrismaClientType["leadStageHistory"] {
    return this.client.leadStageHistory;
  }

  get activity(): PrismaClientType["activity"] {
    return this.client.activity;
  }

  get conversion(): PrismaClientType["conversion"] {
    return this.client.conversion;
  }

  get unit(): PrismaClientType["unit"] {
    return this.client.unit;
  }

  get user(): PrismaClientType["user"] {
    return this.client.user;
  }

  get patient(): PrismaClientType["patient"] {
    return this.client.patient;
  }

  get patientFlag(): PrismaClientType["patientFlag"] {
    return this.client.patientFlag;
  }

  get patientGoal(): PrismaClientType["patientGoal"] {
    return this.client.patientGoal;
  }

  get appointment(): PrismaClientType["appointment"] {
    return this.client.appointment;
  }

  get appointmentConfirmation(): PrismaClientType["appointmentConfirmation"] {
    return this.client.appointmentConfirmation;
  }

  get noShowRecord(): PrismaClientType["noShowRecord"] {
    return this.client.noShowRecord;
  }

  get checkin(): PrismaClientType["checkin"] {
    return this.client.checkin;
  }

  get encounter(): PrismaClientType["encounter"] {
    return this.client.encounter;
  }

  get anamnesis(): PrismaClientType["anamnesis"] {
    return this.client.anamnesis;
  }

  get consultationNote(): PrismaClientType["consultationNote"] {
    return this.client.consultationNote;
  }

  get clinicalTask(): PrismaClientType["clinicalTask"] {
    return this.client.clinicalTask;
  }

  async $connect() {
    await this.client.$connect();
  }

  async $disconnect() {
    await this.client.$disconnect();
  }

  $transaction(...args: any[]) {
    return (this.client.$transaction as any)(...args);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
