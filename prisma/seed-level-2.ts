import 'dotenv/config';
import {
  PrismaClient,
  ActivityType,
  AdverseEventSeverity,
  AdverseEventStatus,
  AppointmentSource,
  AppointmentStatus,
  CheckinType,
  ClinicalTaskPriority,
  ClinicalTaskStatus,
  EncounterStatus,
  EncounterType,
  FlagSeverity,
  LeadStatus,
  PrescriptionType,
  ProposalStatus,
  RecordStatus,
} from '../generated/prisma/client/client';
import { PrismaPg as PgAdapter } from '@prisma/adapter-pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definida.');
}

const adapter = new PgAdapter(process.env.DATABASE_URL);
const prisma = new PrismaClient({
  adapter,
  log: ['warn', 'error'],
});

function daysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function hoursFrom(date: Date, hours: number) {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

async function getSeedContext() {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: 'seed-tenant-main' },
  });

  const unit = await prisma.unit.findUniqueOrThrow({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: 'MATRIZ',
      },
    },
  });

  const doctorUser = await prisma.user.findUniqueOrThrow({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: 'doctor@performanceclinic.com',
      },
    },
  });

  const nurseUser = await prisma.user.findUniqueOrThrow({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: 'nurse@performanceclinic.com',
      },
    },
  });

  const salesUser = await prisma.user.findUniqueOrThrow({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: 'sales@performanceclinic.com',
      },
    },
  });

  const receptionUser = await prisma.user.findUniqueOrThrow({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: 'reception@performanceclinic.com',
      },
    },
  });

  const doctorProfessional = await prisma.professional.findFirstOrThrow({
    where: {
      tenantId: tenant.id,
      userId: doctorUser.id,
    },
  });

  const nurseProfessional = await prisma.professional.findFirstOrThrow({
    where: {
      tenantId: tenant.id,
      userId: nurseUser.id,
    },
  });

  const initialConsult = await prisma.appointmentType.findUniqueOrThrow({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: 'initial_consult',
      },
    },
  });

  const followUp = await prisma.appointmentType.findUniqueOrThrow({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: 'follow_up',
      },
    },
  });

  const bodyAssessment = await prisma.appointmentType.findUniqueOrThrow({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: 'body_assessment',
      },
    },
  });

  const procedureType = await prisma.appointmentType.findUniqueOrThrow({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: 'procedure',
      },
    },
  });

  const tags = await prisma.tag.findMany({
    where: { tenantId: tenant.id },
  });

  const pipeline = await prisma.pipeline.findUniqueOrThrow({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: 'default-sales',
      },
    },
  });

  const stages = await prisma.pipelineStage.findMany({
    where: { pipelineId: pipeline.id },
  });

  const stageMap = Object.fromEntries(stages.map((s) => [s.code, s]));

  return {
    tenant,
    unit,
    doctorUser,
    nurseUser,
    salesUser,
    receptionUser,
    doctorProfessional,
    nurseProfessional,
    initialConsult,
    followUp,
    bodyAssessment,
    procedureType,
    tags,
    stageMap,
  };
}

async function upsertPatientWithProfile(params: {
  tenantId: string;
  fullName: string;
  cpf: string;
  birthDate: Date;
  phone: string;
  email: string;
  goalsSummary: string;
  lifestyleSummary: string;
}) {
  const patient = await prisma.patient.upsert({
    where: {
      tenantId_cpf: {
        tenantId: params.tenantId,
        cpf: params.cpf,
      },
    },
    update: {
      fullName: params.fullName,
      primaryPhone: params.phone,
      primaryEmail: params.email,
      deletedAt: null,
      status: RecordStatus.ACTIVE,
    },
    create: {
      tenantId: params.tenantId,
      fullName: params.fullName,
      cpf: params.cpf,
      birthDate: params.birthDate,
      primaryPhone: params.phone,
      primaryEmail: params.email,
      status: RecordStatus.ACTIVE,
    },
  });

  await prisma.patientProfile.upsert({
    where: { patientId: patient.id },
    update: {
      goalsSummary: params.goalsSummary,
      lifestyleSummary: params.lifestyleSummary,
    },
    create: {
      patientId: patient.id,
      goalsSummary: params.goalsSummary,
      lifestyleSummary: params.lifestyleSummary,
    },
  });

  return patient;
}

async function ensurePatientTag(patientId: string, tagId: string) {
  await prisma.patientTag.upsert({
    where: {
      patientId_tagId: {
        patientId,
        tagId,
      },
    },
    update: {},
    create: {
      patientId,
      tagId,
    },
  });
}

async function createPatientLevel2Data() {
  const ctx = await getSeedContext();

  const tagByCode = Object.fromEntries(ctx.tags.map((t) => [t.code, t]));

  const patientA = await upsertPatientWithProfile({
    tenantId: ctx.tenant.id,
    fullName: 'Mariana Souza',
    cpf: '111.111.111-11',
    birthDate: new Date('1992-03-14'),
    phone: '(99) 99111-1111',
    email: 'mariana.souza@email.com',
    goalsSummary: 'Perda de peso com melhora de composição corporal.',
    lifestyleSummary: 'Rotina sedentária parcial, dificuldade com consistência alimentar.',
  });

  const patientB = await upsertPatientWithProfile({
    tenantId: ctx.tenant.id,
    fullName: 'Paula Ribeiro',
    cpf: '222.222.222-22',
    birthDate: new Date('1988-08-09'),
    phone: '(99) 99222-2222',
    email: 'paula.ribeiro@email.com',
    goalsSummary: 'Emagrecimento, melhor adesão e controle de fome.',
    lifestyleSummary: 'Alta demanda de trabalho, histórico de abandono de acompanhamento.',
  });

  const patientC = await upsertPatientWithProfile({
    tenantId: ctx.tenant.id,
    fullName: 'Lucas Martins',
    cpf: '333.333.333-33',
    birthDate: new Date('1998-11-21'),
    phone: '(99) 99333-3333',
    email: 'lucas.martins@email.com',
    goalsSummary: 'Hipertrofia com ganho de massa magra e disciplina de treino.',
    lifestyleSummary: 'Já treina, mas precisa melhorar dieta e progressão.',
  });

  const patientD = await upsertPatientWithProfile({
    tenantId: ctx.tenant.id,
    fullName: 'Fernanda Alves',
    cpf: '444.444.444-44',
    birthDate: new Date('1995-01-05'),
    phone: '(99) 99444-4444',
    email: 'fernanda.alves@email.com',
    goalsSummary: 'Paciente recém-convertida para programa clínico.',
    lifestyleSummary: 'Vindo de lead quente do Instagram.',
  });

  await prisma.responsibleParty.upsert({
    where: {
      id: `rp-${patientA.id}`,
    },
    update: {},
    create: {
      id: `rp-${patientA.id}`,
      tenantId: ctx.tenant.id,
      patientId: patientA.id,
      fullName: 'Mariana Souza',
      cpfCnpj: '111.111.111-11',
      phone: '(99) 99111-1111',
      email: 'mariana.souza@email.com',
    },
  });

  await prisma.responsibleParty.upsert({
    where: {
      id: `rp-${patientB.id}`,
    },
    update: {},
    create: {
      id: `rp-${patientB.id}`,
      tenantId: ctx.tenant.id,
      patientId: patientB.id,
      fullName: 'Paula Ribeiro',
      cpfCnpj: '222.222.222-22',
      phone: '(99) 99222-2222',
      email: 'paula.ribeiro@email.com',
    },
  });

  await ensurePatientTag(patientA.id, tagByCode.weight_loss.id);
  await ensurePatientTag(patientB.id, tagByCode.weight_loss.id);
  await ensurePatientTag(patientB.id, tagByCode.dropout_risk.id);
  await ensurePatientTag(patientC.id, tagByCode.hypertrophy.id);
  await ensurePatientTag(patientD.id, tagByCode.weight_loss.id);

  await prisma.patientFlag.upsert({
    where: {
      id: `flag-risk-${patientB.id}`,
    },
    update: {
      active: true,
      severity: FlagSeverity.HIGH,
      description: 'Paciente com histórico de baixa adesão e risco de abandono.',
    },
    create: {
      id: `flag-risk-${patientB.id}`,
      tenantId: ctx.tenant.id,
      patientId: patientB.id,
      flagType: 'dropout_risk',
      severity: FlagSeverity.HIGH,
      description: 'Paciente com histórico de baixa adesão e risco de abandono.',
      createdBy: ctx.doctorUser.id,
    },
  });

  await prisma.patientFlag.upsert({
    where: {
      id: `flag-vip-${patientA.id}`,
    },
    update: {
      active: true,
      severity: FlagSeverity.LOW,
      description: 'Paciente organizada e aderente.',
    },
    create: {
      id: `flag-vip-${patientA.id}`,
      tenantId: ctx.tenant.id,
      patientId: patientA.id,
      flagType: 'vip_attention',
      severity: FlagSeverity.LOW,
      description: 'Paciente organizada e aderente.',
      createdBy: ctx.receptionUser.id,
    },
  });

  return { ctx, patientA, patientB, patientC, patientD };
}

async function createLeadConversionForPatientD(patientId: string, ctx: Awaited<ReturnType<typeof getSeedContext>>) {
  const lead = await prisma.lead.upsert({
    where: {
      id: `lead-converted-${patientId}`,
    },
    update: {
      status: LeadStatus.WON,
      deletedAt: null,
    },
    create: {
      id: `lead-converted-${patientId}`,
      tenantId: ctx.tenant.id,
      fullName: 'Fernanda Alves',
      phone: '(99) 99444-4444',
      email: 'fernanda.alves@email.com',
      source: 'instagram',
      campaign: 'campanha-conversao-seed',
      interestType: 'weight_loss',
      status: LeadStatus.WON,
    },
  });

  await prisma.leadProfile.upsert({
    where: { leadId: lead.id },
    update: {
      mainGoal: 'Perder peso com acompanhamento médico',
      budgetRange: 'high',
      urgencyLevel: 'high',
      painPoint: 'Tentou sozinha e não conseguiu manter regularidade',
    },
    create: {
      leadId: lead.id,
      mainGoal: 'Perder peso com acompanhamento médico',
      budgetRange: 'high',
      urgencyLevel: 'high',
      painPoint: 'Tentou sozinha e não conseguiu manter regularidade',
    },
  });

  await prisma.leadStageHistory.createMany({
    data: [
      { leadId: lead.id, stageId: ctx.stageMap.new.id, changedBy: ctx.salesUser.id },
      { leadId: lead.id, stageId: ctx.stageMap.contacted.id, changedBy: ctx.salesUser.id },
      { leadId: lead.id, stageId: ctx.stageMap.qualified.id, changedBy: ctx.salesUser.id },
      { leadId: lead.id, stageId: ctx.stageMap.appointment_booked.id, changedBy: ctx.salesUser.id },
      { leadId: lead.id, stageId: ctx.stageMap.proposal_sent.id, changedBy: ctx.salesUser.id },
      { leadId: lead.id, stageId: ctx.stageMap.won.id, changedBy: ctx.salesUser.id },
    ],
    skipDuplicates: true,
  });

  await prisma.proposal.upsert({
    where: {
      id: `proposal-${lead.id}`,
    },
    update: {
      status: ProposalStatus.ACCEPTED,
      price: 2490,
      discount: 0,
    },
    create: {
      id: `proposal-${lead.id}`,
      leadId: lead.id,
      suggestedPlanName: 'Programa Emagrecimento Intensivo',
      price: 2490,
      discount: 0,
      status: ProposalStatus.ACCEPTED,
      createdBy: ctx.salesUser.id,
      expiresAt: daysFromNow(7),
    },
  });

  await prisma.conversion.upsert({
    where: {
      leadId: lead.id,
    },
    update: {
      patientId,
      convertedBy: ctx.salesUser.id,
    },
    create: {
      leadId: lead.id,
      patientId,
      convertedBy: ctx.salesUser.id,
    },
  });
}

async function createAppointmentsAndClinicalFlows(data: Awaited<ReturnType<typeof createPatientLevel2Data>>) {
  const { ctx, patientA, patientB, patientC, patientD } = data;

  const now = new Date();

  // Patient A - fluxo bom
  const aInitialDate = daysFromNow(-20);
  const aFollowDate = daysFromNow(-5);
  const aNextDate = daysFromNow(10);

  const appointmentA1 = await prisma.appointment.upsert({
    where: { id: 'appt-a-1' },
    update: {
      status: AppointmentStatus.COMPLETED,
    },
    create: {
      id: 'appt-a-1',
      tenantId: ctx.tenant.id,
      unitId: ctx.unit.id,
      patientId: patientA.id,
      professionalId: ctx.doctorProfessional.id,
      appointmentTypeId: ctx.initialConsult.id,
      startsAt: aInitialDate,
      endsAt: hoursFrom(aInitialDate, 1),
      status: AppointmentStatus.COMPLETED,
      source: AppointmentSource.INTERNAL,
      createdBy: ctx.receptionUser.id,
    },
  });

  const appointmentA2 = await prisma.appointment.upsert({
    where: { id: 'appt-a-2' },
    update: {
      status: AppointmentStatus.COMPLETED,
    },
    create: {
      id: 'appt-a-2',
      tenantId: ctx.tenant.id,
      unitId: ctx.unit.id,
      patientId: patientA.id,
      professionalId: ctx.doctorProfessional.id,
      appointmentTypeId: ctx.followUp.id,
      startsAt: aFollowDate,
      endsAt: hoursFrom(aFollowDate, 1),
      status: AppointmentStatus.COMPLETED,
      source: AppointmentSource.INTERNAL,
      createdBy: ctx.receptionUser.id,
    },
  });

  const appointmentA3 = await prisma.appointment.upsert({
    where: { id: 'appt-a-3' },
    update: {
      status: AppointmentStatus.SCHEDULED,
    },
    create: {
      id: 'appt-a-3',
      tenantId: ctx.tenant.id,
      unitId: ctx.unit.id,
      patientId: patientA.id,
      professionalId: ctx.doctorProfessional.id,
      appointmentTypeId: ctx.followUp.id,
      startsAt: aNextDate,
      endsAt: hoursFrom(aNextDate, 1),
      status: AppointmentStatus.SCHEDULED,
      source: AppointmentSource.INTERNAL,
      createdBy: ctx.receptionUser.id,
    },
  });

  // Patient B - risco e no-show
  const bInitialDate = daysFromNow(-18);
  const bNoShowDate = daysFromNow(-2);

  const appointmentB1 = await prisma.appointment.upsert({
    where: { id: 'appt-b-1' },
    update: {
      status: AppointmentStatus.COMPLETED,
    },
    create: {
      id: 'appt-b-1',
      tenantId: ctx.tenant.id,
      unitId: ctx.unit.id,
      patientId: patientB.id,
      professionalId: ctx.doctorProfessional.id,
      appointmentTypeId: ctx.initialConsult.id,
      startsAt: bInitialDate,
      endsAt: hoursFrom(bInitialDate, 1),
      status: AppointmentStatus.COMPLETED,
      source: AppointmentSource.INTERNAL,
      createdBy: ctx.receptionUser.id,
    },
  });

  const appointmentB2 = await prisma.appointment.upsert({
    where: { id: 'appt-b-2' },
    update: {
      status: AppointmentStatus.NO_SHOW,
    },
    create: {
      id: 'appt-b-2',
      tenantId: ctx.tenant.id,
      unitId: ctx.unit.id,
      patientId: patientB.id,
      professionalId: ctx.doctorProfessional.id,
      appointmentTypeId: ctx.followUp.id,
      startsAt: bNoShowDate,
      endsAt: hoursFrom(bNoShowDate, 1),
      status: AppointmentStatus.NO_SHOW,
      source: AppointmentSource.INTERNAL,
      createdBy: ctx.receptionUser.id,
    },
  });

  await prisma.noShowRecord.upsert({
    where: {
      appointmentId: appointmentB2.id,
    },
    update: {
      penaltyApplied: false,
      reason: 'Paciente não compareceu e não confirmou reagendamento.',
    },
    create: {
      appointmentId: appointmentB2.id,
      patientId: patientB.id,
      recordedBy: ctx.receptionUser.id,
      reason: 'Paciente não compareceu e não confirmou reagendamento.',
      penaltyApplied: false,
    },
  });

  // Patient C - hipertrofia
  const cInitialDate = daysFromNow(-12);
  const cAssessmentDate = daysFromNow(-3);

  const appointmentC1 = await prisma.appointment.upsert({
    where: { id: 'appt-c-1' },
    update: {
      status: AppointmentStatus.COMPLETED,
    },
    create: {
      id: 'appt-c-1',
      tenantId: ctx.tenant.id,
      unitId: ctx.unit.id,
      patientId: patientC.id,
      professionalId: ctx.doctorProfessional.id,
      appointmentTypeId: ctx.initialConsult.id,
      startsAt: cInitialDate,
      endsAt: hoursFrom(cInitialDate, 1),
      status: AppointmentStatus.COMPLETED,
      source: AppointmentSource.INTERNAL,
      createdBy: ctx.receptionUser.id,
    },
  });

  const appointmentC2 = await prisma.appointment.upsert({
    where: { id: 'appt-c-2' },
    update: {
      status: AppointmentStatus.COMPLETED,
    },
    create: {
      id: 'appt-c-2',
      tenantId: ctx.tenant.id,
      unitId: ctx.unit.id,
      patientId: patientC.id,
      professionalId: ctx.doctorProfessional.id,
      appointmentTypeId: ctx.bodyAssessment.id,
      startsAt: cAssessmentDate,
      endsAt: hoursFrom(cAssessmentDate, 1),
      status: AppointmentStatus.COMPLETED,
      source: AppointmentSource.INTERNAL,
      createdBy: ctx.receptionUser.id,
    },
  });

  // Patient D - recém-convertida
  const dInitialDate = daysFromNow(3);

  const appointmentD1 = await prisma.appointment.upsert({
    where: { id: 'appt-d-1' },
    update: {
      status: AppointmentStatus.CONFIRMED,
    },
    create: {
      id: 'appt-d-1',
      tenantId: ctx.tenant.id,
      unitId: ctx.unit.id,
      patientId: patientD.id,
      professionalId: ctx.doctorProfessional.id,
      appointmentTypeId: ctx.initialConsult.id,
      startsAt: dInitialDate,
      endsAt: hoursFrom(dInitialDate, 1),
      status: AppointmentStatus.CONFIRMED,
      source: AppointmentSource.CRM,
      createdBy: ctx.salesUser.id,
    },
  });

  await prisma.appointmentConfirmation.createMany({
    data: [
      {
        appointmentId: appointmentA3.id,
        channel: 'WHATSAPP',
        status: 'SENT',
        sentAt: now,
      },
      {
        appointmentId: appointmentD1.id,
        channel: 'WHATSAPP',
        status: 'CONFIRMED',
        sentAt: now,
        respondedAt: now,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.checkin.createMany({
    data: [
      {
        appointmentId: appointmentA1.id,
        checkinType: CheckinType.FRONTDESK,
        checkedInAt: aInitialDate,
        checkedInBy: ctx.receptionUser.id,
      },
      {
        appointmentId: appointmentA2.id,
        checkinType: CheckinType.FRONTDESK,
        checkedInAt: aFollowDate,
        checkedInBy: ctx.receptionUser.id,
      },
      {
        appointmentId: appointmentB1.id,
        checkinType: CheckinType.FRONTDESK,
        checkedInAt: bInitialDate,
        checkedInBy: ctx.receptionUser.id,
      },
      {
        appointmentId: appointmentC1.id,
        checkinType: CheckinType.FRONTDESK,
        checkedInAt: cInitialDate,
        checkedInBy: ctx.receptionUser.id,
      },
      {
        appointmentId: appointmentC2.id,
        checkinType: CheckinType.FRONTDESK,
        checkedInAt: cAssessmentDate,
        checkedInBy: ctx.receptionUser.id,
      },
    ],
    skipDuplicates: true,
  });

  return {
    ...data,
    appointmentA1,
    appointmentA2,
    appointmentA3,
    appointmentB1,
    appointmentB2,
    appointmentC1,
    appointmentC2,
    appointmentD1,
  };
}

async function createEncountersAndNotes(data: Awaited<ReturnType<typeof createAppointmentsAndClinicalFlows>>) {
  const {
    ctx,
    patientA,
    patientB,
    patientC,
    appointmentA1,
    appointmentA2,
    appointmentB1,
    appointmentC1,
    appointmentC2,
  } = data;

  const encounterA1 = await prisma.encounter.upsert({
    where: { appointmentId: appointmentA1.id },
    update: {
      status: EncounterStatus.CLOSED,
      closedAt: appointmentA1.endsAt,
    },
    create: {
      tenantId: ctx.tenant.id,
      unitId: ctx.unit.id,
      patientId: patientA.id,
      appointmentId: appointmentA1.id,
      professionalId: ctx.doctorProfessional.id,
      encounterType: EncounterType.INITIAL_CONSULT,
      status: EncounterStatus.CLOSED,
      openedAt: appointmentA1.startsAt,
      closedAt: appointmentA1.endsAt,
    },
  });

  const encounterA2 = await prisma.encounter.upsert({
    where: { appointmentId: appointmentA2.id },
    update: {
      status: EncounterStatus.CLOSED,
      closedAt: appointmentA2.endsAt,
    },
    create: {
      tenantId: ctx.tenant.id,
      unitId: ctx.unit.id,
      patientId: patientA.id,
      appointmentId: appointmentA2.id,
      professionalId: ctx.doctorProfessional.id,
      encounterType: EncounterType.FOLLOW_UP,
      status: EncounterStatus.CLOSED,
      openedAt: appointmentA2.startsAt,
      closedAt: appointmentA2.endsAt,
    },
  });

  const encounterB1 = await prisma.encounter.upsert({
    where: { appointmentId: appointmentB1.id },
    update: {
      status: EncounterStatus.CLOSED,
      closedAt: appointmentB1.endsAt,
    },
    create: {
      tenantId: ctx.tenant.id,
      unitId: ctx.unit.id,
      patientId: patientB.id,
      appointmentId: appointmentB1.id,
      professionalId: ctx.doctorProfessional.id,
      encounterType: EncounterType.INITIAL_CONSULT,
      status: EncounterStatus.CLOSED,
      openedAt: appointmentB1.startsAt,
      closedAt: appointmentB1.endsAt,
    },
  });

  const encounterC1 = await prisma.encounter.upsert({
    where: { appointmentId: appointmentC1.id },
    update: {
      status: EncounterStatus.CLOSED,
      closedAt: appointmentC1.endsAt,
    },
    create: {
      tenantId: ctx.tenant.id,
      unitId: ctx.unit.id,
      patientId: patientC.id,
      appointmentId: appointmentC1.id,
      professionalId: ctx.doctorProfessional.id,
      encounterType: EncounterType.INITIAL_CONSULT,
      status: EncounterStatus.CLOSED,
      openedAt: appointmentC1.startsAt,
      closedAt: appointmentC1.endsAt,
    },
  });

  const encounterC2 = await prisma.encounter.upsert({
    where: { appointmentId: appointmentC2.id },
    update: {
      status: EncounterStatus.CLOSED,
      closedAt: appointmentC2.endsAt,
    },
    create: {
      tenantId: ctx.tenant.id,
      unitId: ctx.unit.id,
      patientId: patientC.id,
      appointmentId: appointmentC2.id,
      professionalId: ctx.doctorProfessional.id,
      encounterType: EncounterType.REVIEW,
      status: EncounterStatus.CLOSED,
      openedAt: appointmentC2.startsAt,
      closedAt: appointmentC2.endsAt,
    },
  });

  await prisma.anamnesis.upsert({
    where: { encounterId: encounterA1.id },
    update: {},
    create: {
      encounterId: encounterA1.id,
      chiefComplaint: 'Dificuldade em perder peso e manter consistência alimentar.',
      historyOfPresentIllness: 'Ganho progressivo de peso nos últimos anos com baixa aderência a planos anteriores.',
      pastMedicalHistory: 'Sem comorbidades relevantes relatadas.',
      lifestyleHistory: 'Sedentarismo parcial, refeições fora de horário.',
      notes: 'Boa receptividade ao plano e alta motivação inicial.',
    },
  });

  await prisma.anamnesis.upsert({
    where: { encounterId: encounterB1.id },
    update: {},
    create: {
      encounterId: encounterB1.id,
      chiefComplaint: 'Desejo de emagrecimento, mas relata falhas repetidas em aderência.',
      historyOfPresentIllness: 'Histórico de tentativas anteriores interrompidas.',
      pastMedicalHistory: 'Sem dados relevantes no seed.',
      lifestyleHistory: 'Rotina profissional intensa, come por impulso.',
      notes: 'Paciente verbaliza dificuldade com disciplina e seguimento.',
    },
  });

  await prisma.anamnesis.upsert({
    where: { encounterId: encounterC1.id },
    update: {},
    create: {
      encounterId: encounterC1.id,
      chiefComplaint: 'Busca por hipertrofia com orientação médica.',
      historyOfPresentIllness: 'Treina regularmente, mas sem estratégia nutricional consistente.',
      lifestyleHistory: 'Frequenta academia 5x/semana.',
      notes: 'Perfil disciplinado, bom potencial de aderência.',
    },
  });

  await prisma.consultationNote.createMany({
    data: [
      {
        encounterId: encounterA1.id,
        noteType: 'SOAP',
        subjective: 'Paciente motivada, relata fome noturna e baixa constância.',
        objective: 'Avaliação inicial realizada. Conduta proposta com foco em adesão.',
        assessment: 'Quadro compatível com necessidade de acompanhamento longitudinal.',
        plan: 'Iniciar plano de emagrecimento com retorno em 15 dias.',
        signedBy: ctx.doctorUser.id,
        signedAt: new Date(),
      },
      {
        encounterId: encounterA2.id,
        noteType: 'SOAP',
        subjective: 'Refere melhora da organização alimentar.',
        objective: 'Boa evolução subjetiva.',
        assessment: 'Aderência satisfatória.',
        plan: 'Manter estratégia e revisar em consulta futura.',
        signedBy: ctx.doctorUser.id,
        signedAt: new Date(),
      },
      {
        encounterId: encounterB1.id,
        noteType: 'SOAP',
        subjective: 'Paciente demonstra preocupação com dificuldade de manutenção.',
        objective: 'Necessita suporte mais frequente.',
        assessment: 'Risco de evasão já na primeira fase.',
        plan: 'Programar contato ativo e reforço de acompanhamento.',
        signedBy: ctx.doctorUser.id,
        signedAt: new Date(),
      },
      {
        encounterId: encounterC1.id,
        noteType: 'SOAP',
        subjective: 'Busca hipertrofia e ajuste de plano global.',
        objective: 'Perfil atlético, sem intercorrências relatadas.',
        assessment: 'Candidato adequado para plano focado em massa magra.',
        plan: 'Solicitar avaliação corporal e organizar retorno com metas.',
        signedBy: ctx.doctorUser.id,
        signedAt: new Date(),
      },
      {
        encounterId: encounterC2.id,
        noteType: 'SOAP',
        subjective: 'Refere bom engajamento com treino.',
        objective: 'Acompanhamento corporal realizado.',
        assessment: 'Boa resposta inicial.',
        plan: 'Seguir monitorando evolução e ajustar ingestão proteica.',
        signedBy: ctx.doctorUser.id,
        signedAt: new Date(),
      },
    ],
  });

  return { ...data, encounterA1, encounterA2, encounterB1, encounterC1, encounterC2 };
}

async function createCarePlansAndTasks(data: Awaited<ReturnType<typeof createEncountersAndNotes>>) {
  const { ctx, patientA, patientB, patientC, encounterA1, encounterB1, encounterC1 } = data;

  const carePlanA = await prisma.carePlan.create({
    data: {
      tenantId: ctx.tenant.id,
      patientId: patientA.id,
      currentStatus: 'ACTIVE',
      summary: 'Plano de emagrecimento com foco em adesão e melhora de composição corporal.',
      startDate: daysFromNow(-20),
      createdBy: ctx.doctorUser.id,
    },
  });

  const carePlanB = await prisma.carePlan.create({
    data: {
      tenantId: ctx.tenant.id,
      patientId: patientB.id,
      currentStatus: 'ACTIVE',
      summary: 'Plano de emagrecimento com reforço de acompanhamento para risco de abandono.',
      startDate: daysFromNow(-18),
      createdBy: ctx.doctorUser.id,
    },
  });

  const carePlanC = await prisma.carePlan.create({
    data: {
      tenantId: ctx.tenant.id,
      patientId: patientC.id,
      currentStatus: 'ACTIVE',
      summary: 'Plano de hipertrofia e performance.',
      startDate: daysFromNow(-12),
      createdBy: ctx.doctorUser.id,
    },
  });

  await prisma.carePlanItem.createMany({
    data: [
      {
        carePlanId: carePlanA.id,
        itemType: 'NUTRITION',
        title: 'Organizar rotina alimentar',
        status: 'IN_PROGRESS',
      },
      {
        carePlanId: carePlanA.id,
        itemType: 'FOLLOW_UP',
        title: 'Retorno em 15 dias',
        status: 'DONE',
        completedAt: daysFromNow(-5),
      },
      {
        carePlanId: carePlanB.id,
        itemType: 'ADHERENCE',
        title: 'Contato ativo para reforço',
        status: 'IN_PROGRESS',
      },
      {
        carePlanId: carePlanC.id,
        itemType: 'BODY_COMPOSITION',
        title: 'Avaliação corporal inicial',
        status: 'DONE',
        completedAt: daysFromNow(-3),
      },
    ],
  });

  await prisma.clinicalTask.createMany({
    data: [
      {
        tenantId: ctx.tenant.id,
        patientId: patientA.id,
        encounterId: encounterA1.id,
        assignedToUserId: ctx.doctorUser.id,
        taskType: 'follow_up_review',
        title: 'Revisar evolução no próximo retorno',
        priority: ClinicalTaskPriority.MEDIUM,
        status: ClinicalTaskStatus.OPEN,
        dueAt: daysFromNow(10),
      },
      {
        tenantId: ctx.tenant.id,
        patientId: patientB.id,
        encounterId: encounterB1.id,
        assignedToUserId: ctx.nurseUser.id,
        taskType: 'active_outreach',
        title: 'Entrar em contato após no-show',
        description: 'Paciente faltou no retorno e precisa ser reengajada.',
        priority: ClinicalTaskPriority.HIGH,
        status: ClinicalTaskStatus.OPEN,
        dueAt: daysFromNow(1),
      },
      {
        tenantId: ctx.tenant.id,
        patientId: patientC.id,
        encounterId: encounterC1.id,
        assignedToUserId: ctx.doctorUser.id,
        taskType: 'review_body_assessment',
        title: 'Consolidar metas de hipertrofia após avaliação corporal',
        priority: ClinicalTaskPriority.MEDIUM,
        status: ClinicalTaskStatus.OPEN,
        dueAt: daysFromNow(2),
      },
    ],
  });

  await prisma.problemList.createMany({
    data: [
      {
        patientId: patientA.id,
        problemName: 'Excesso de peso',
        status: 'ACTIVE',
      },
      {
        patientId: patientB.id,
        problemName: 'Baixa adesão comportamental',
        status: 'ACTIVE',
      },
      {
        patientId: patientC.id,
        problemName: 'Necessidade de otimização de composição corporal',
        status: 'ACTIVE',
      },
    ],
  });

  await prisma.patientGoal.createMany({
    data: [
      {
        patientId: patientA.id,
        goalType: 'weight_loss',
        title: 'Reduzir peso corporal com consistência',
        targetValue: '-6kg',
        currentValue: '-2kg',
        status: 'IN_PROGRESS',
        createdBy: ctx.doctorUser.id,
        targetDate: daysFromNow(60),
      },
      {
        patientId: patientB.id,
        goalType: 'adherence',
        title: 'Melhorar adesão e comparecimento',
        targetValue: '100% nas próximas 3 semanas',
        currentValue: 'Baixa adesão',
        status: 'IN_PROGRESS',
        createdBy: ctx.doctorUser.id,
        targetDate: daysFromNow(30),
      },
      {
        patientId: patientC.id,
        goalType: 'hypertrophy',
        title: 'Aumentar consistência para ganho de massa magra',
        targetValue: '+2kg massa magra',
        currentValue: 'baseline',
        status: 'IN_PROGRESS',
        createdBy: ctx.doctorUser.id,
        targetDate: daysFromNow(90),
      },
    ],
  });

  await prisma.prescriptionRecord.createMany({
    data: [
      {
        encounterId: encounterA1.id,
        patientId: patientA.id,
        prescriptionType: PrescriptionType.ORIENTATION,
        summary: 'Orientações iniciais de rotina e seguimento.',
        issuedBy: ctx.doctorUser.id,
      },
      {
        encounterId: encounterB1.id,
        patientId: patientB.id,
        prescriptionType: PrescriptionType.ORIENTATION,
        summary: 'Orientações para adesão e acompanhamento mais frequente.',
        issuedBy: ctx.doctorUser.id,
      },
      {
        encounterId: encounterC1.id,
        patientId: patientC.id,
        prescriptionType: PrescriptionType.TRAINING_GUIDANCE,
        summary: 'Orientação de seguimento focado em performance e disciplina.',
        issuedBy: ctx.doctorUser.id,
      },
    ],
  });

  await prisma.adverseEvent.create({
    data: {
      tenantId: ctx.tenant.id,
      patientId: patientB.id,
      encounterId: encounterB1.id,
      severity: AdverseEventSeverity.MILD,
      eventType: 'low_tolerance_report',
      description: 'Paciente relatou desconforto leve e desorganização no seguimento.',
      status: AdverseEventStatus.MONITORING,
      recordedBy: ctx.doctorUser.id,
      onsetAt: daysFromNow(-15),
    },
  });

  return data;
}

async function createHabitLogs(data: Awaited<ReturnType<typeof createCarePlansAndTasks>>) {
  const { patientA, patientB, patientC } = data;

  await prisma.hydrationLog.createMany({
    data: [
      { patientId: patientA.id, loggedAt: daysFromNow(-1), volumeMl: 2200 },
      { patientId: patientA.id, loggedAt: daysFromNow(-2), volumeMl: 2000 },
      { patientId: patientB.id, loggedAt: daysFromNow(-1), volumeMl: 900 },
      { patientId: patientC.id, loggedAt: daysFromNow(-1), volumeMl: 2800 },
    ],
  });

  await prisma.mealLog.createMany({
    data: [
      {
        patientId: patientA.id,
        loggedAt: daysFromNow(-1),
        mealType: 'lunch',
        description: 'Refeição alinhada ao plano',
        adherenceRating: 8,
      },
      {
        patientId: patientB.id,
        loggedAt: daysFromNow(-1),
        mealType: 'dinner',
        description: 'Relata refeição desorganizada fora do planejado',
        adherenceRating: 3,
      },
      {
        patientId: patientC.id,
        loggedAt: daysFromNow(-1),
        mealType: 'post_workout',
        description: 'Refeição pós-treino adequada',
        adherenceRating: 9,
      },
    ],
  });

  await prisma.workoutLog.createMany({
    data: [
      {
        patientId: patientA.id,
        loggedAt: daysFromNow(-1),
        workoutType: 'walk',
        durationMinutes: 40,
        intensity: 'moderate',
      },
      {
        patientId: patientB.id,
        loggedAt: daysFromNow(-3),
        workoutType: 'none',
        durationMinutes: 0,
        intensity: 'none',
        completed: false,
      },
      {
        patientId: patientC.id,
        loggedAt: daysFromNow(-1),
        workoutType: 'strength_training',
        durationMinutes: 75,
        intensity: 'high',
      },
    ],
  });

  await prisma.sleepLog.createMany({
    data: [
      {
        patientId: patientA.id,
        sleepDate: daysFromNow(-1),
        hoursSlept: 7.5,
        sleepQualityScore: 8,
      },
      {
        patientId: patientB.id,
        sleepDate: daysFromNow(-1),
        hoursSlept: 5.5,
        sleepQualityScore: 4,
      },
      {
        patientId: patientC.id,
        sleepDate: daysFromNow(-1),
        hoursSlept: 8,
        sleepQualityScore: 8,
      },
    ],
  });

  await prisma.symptomLog.createMany({
    data: [
      {
        patientId: patientA.id,
        loggedAt: daysFromNow(-1),
        symptomType: 'hunger_control',
        severityScore: 3,
        description: 'Melhora progressiva do controle de fome.',
      },
      {
        patientId: patientB.id,
        loggedAt: daysFromNow(-1),
        symptomType: 'anxiety_eating',
        severityScore: 7,
        description: 'Refere piora da compulsão em dias estressantes.',
      },
    ],
  });
}

async function createExtraLeadExamples(ctx: Awaited<ReturnType<typeof getSeedContext>>) {
  const lead1 = await prisma.lead.upsert({
    where: { id: 'lead-extra-1' },
    update: {
      status: LeadStatus.QUALIFIED,
    },
    create: {
      id: 'lead-extra-1',
      tenantId: ctx.tenant.id,
      fullName: 'Carla Menezes',
      phone: '(99) 99555-1111',
      email: 'carla.menezes@email.com',
      source: 'google',
      campaign: 'consulta-inicial-google',
      interestType: 'body_modulation',
      status: LeadStatus.QUALIFIED,
    },
  });

  await prisma.leadProfile.upsert({
    where: { leadId: lead1.id },
    update: {},
    create: {
      leadId: lead1.id,
      mainGoal: 'Melhora estética corporal',
      budgetRange: 'medium',
      urgencyLevel: 'medium',
      painPoint: 'Insatisfação com composição corporal',
    },
  });

  await prisma.activity.create({
    data: {
      leadId: lead1.id,
      assignedUserId: ctx.salesUser.id,
      activityType: ActivityType.TASK,
      description: 'Enviar proposta e tentar agendar consulta ainda hoje.',
      dueAt: daysFromNow(1),
    },
  });
}

async function main() {
  console.log('🌱 Iniciando seed nível 2...');

  const patientData = await createPatientLevel2Data();
  await createLeadConversionForPatientD(patientData.patientD.id, patientData.ctx);
  const appointmentsData = await createAppointmentsAndClinicalFlows(patientData);
  const encountersData = await createEncountersAndNotes(appointmentsData);
  const carePlanData = await createCarePlansAndTasks(encountersData);
  await createHabitLogs(carePlanData);
  await createExtraLeadExamples(patientData.ctx);

  console.log('✅ Seed nível 2 concluído com sucesso.');
}

main()
  .catch((error) => {
    console.error('❌ Erro no seed nível 2:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });