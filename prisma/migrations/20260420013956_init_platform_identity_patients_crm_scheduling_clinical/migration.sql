-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "clinical";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "crm";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "identity";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "patients";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "platform";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "scheduling";

-- CreateEnum
CREATE TYPE "platform"."RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "platform"."UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "platform"."UnitStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "platform"."ProfessionalType" AS ENUM ('PHYSICIAN', 'NUTRITIONIST', 'NURSE', 'PHYSICAL_TRAINER', 'RECEPTIONIST', 'FINANCIAL', 'ADMINISTRATIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "platform"."CalendarType" AS ENUM ('PROFESSIONAL', 'RESOURCE', 'UNIT');

-- CreateEnum
CREATE TYPE "platform"."ResourceType" AS ENUM ('ROOM', 'EQUIPMENT', 'DEVICE', 'APPLICATION_STATION', 'BED', 'OTHER');

-- CreateEnum
CREATE TYPE "platform"."AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "platform"."AppointmentSource" AS ENUM ('INTERNAL', 'PATIENT_APP', 'CRM', 'AUTOMATION', 'OTHER');

-- CreateEnum
CREATE TYPE "platform"."ConfirmationChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'MANUAL');

-- CreateEnum
CREATE TYPE "platform"."ConfirmationStatus" AS ENUM ('SENT', 'DELIVERED', 'CONFIRMED', 'DECLINED', 'NO_RESPONSE', 'FAILED');

-- CreateEnum
CREATE TYPE "platform"."CheckinType" AS ENUM ('FRONTDESK', 'SELF_SERVICE', 'DIGITAL');

-- CreateEnum
CREATE TYPE "platform"."LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'APPOINTMENT_BOOKED', 'PROPOSAL_SENT', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "platform"."ActivityType" AS ENUM ('CALL', 'MESSAGE', 'TASK', 'NOTE', 'EMAIL', 'MEETING');

-- CreateEnum
CREATE TYPE "platform"."ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "platform"."FlagSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "platform"."EncounterStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "platform"."EncounterType" AS ENUM ('INITIAL_CONSULT', 'FOLLOW_UP', 'PROCEDURE', 'TELECONSULT', 'REVIEW', 'OTHER');

-- CreateEnum
CREATE TYPE "platform"."ClinicalTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "platform"."ClinicalTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "platform"."AdverseEventSeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE', 'CRITICAL');

-- CreateEnum
CREATE TYPE "platform"."AdverseEventStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'MONITORING', 'CLOSED');

-- CreateEnum
CREATE TYPE "platform"."PrescriptionType" AS ENUM ('PRESCRIPTION', 'ORIENTATION', 'SUPPLEMENT_PLAN', 'TRAINING_GUIDANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "platform"."FileOwnerType" AS ENUM ('USER', 'PATIENT', 'SYSTEM');

-- CreateTable
CREATE TABLE "platform"."tenants" (
    "id" TEXT NOT NULL,
    "legalName" VARCHAR(200) NOT NULL,
    "tradeName" VARCHAR(200),
    "documentNumber" VARCHAR(30),
    "status" "platform"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "subscriptionPlanCode" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."addresses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "street" VARCHAR(200) NOT NULL,
    "number" VARCHAR(30),
    "complement" VARCHAR(120),
    "district" VARCHAR(120),
    "city" VARCHAR(120) NOT NULL,
    "state" VARCHAR(10) NOT NULL,
    "zipCode" VARCHAR(20),
    "country" VARCHAR(2) NOT NULL DEFAULT 'BR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."files" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storageKey" VARCHAR(500) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(120) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" VARCHAR(128),
    "uploadedBy" TEXT,
    "ownerType" "platform"."FileOwnerType",
    "ownerId" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" VARCHAR(120) NOT NULL,
    "resourceType" VARCHAR(120) NOT NULL,
    "resourceId" VARCHAR(80) NOT NULL,
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(500),
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recipientType" VARCHAR(60) NOT NULL,
    "recipientId" VARCHAR(80) NOT NULL,
    "channel" VARCHAR(40) NOT NULL,
    "templateCode" VARCHAR(80),
    "payloadJson" JSONB,
    "status" VARCHAR(40) NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."feature_flags" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "featureCode" VARCHAR(100) NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "configJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."units" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(40),
    "timezone" VARCHAR(80),
    "addressId" TEXT,
    "status" "platform"."UnitStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fullName" VARCHAR(160) NOT NULL,
    "email" VARCHAR(191) NOT NULL,
    "phone" VARCHAR(30),
    "externalAuthId" VARCHAR(191),
    "passwordHash" VARCHAR(255),
    "status" "platform"."UserStatus" NOT NULL DEFAULT 'INVITED',
    "lastLoginAt" TIMESTAMP(3),
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."roles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."permissions" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(120) NOT NULL,
    "description" VARCHAR(255),
    "moduleCode" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."user_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."user_unit_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "accessLevel" VARCHAR(40),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_unit_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients"."patients" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalCode" VARCHAR(80),
    "fullName" VARCHAR(200) NOT NULL,
    "cpf" VARCHAR(14),
    "birthDate" TIMESTAMP(3),
    "sex" VARCHAR(30),
    "gender" VARCHAR(50),
    "maritalStatus" VARCHAR(40),
    "primaryPhone" VARCHAR(30),
    "primaryEmail" VARCHAR(191),
    "status" "platform"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients"."patient_profiles" (
    "patientId" TEXT NOT NULL,
    "occupation" VARCHAR(120),
    "referralSource" VARCHAR(120),
    "lifestyleSummary" TEXT,
    "goalsSummary" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_profiles_pkey" PRIMARY KEY ("patientId")
);

-- CreateTable
CREATE TABLE "patients"."patient_addresses" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "addressType" VARCHAR(40),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients"."emergency_contacts" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "relationship" VARCHAR(80),
    "phone" VARCHAR(30),
    "email" VARCHAR(191),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients"."responsible_parties" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "fullName" VARCHAR(160) NOT NULL,
    "cpfCnpj" VARCHAR(20),
    "phone" VARCHAR(30),
    "email" VARCHAR(191),
    "addressId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "responsible_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients"."tags" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "color" VARCHAR(20),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients"."patient_tags" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients"."patient_flags" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "flagType" VARCHAR(80) NOT NULL,
    "severity" "platform"."FlagSeverity" NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients"."patient_merge_history" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourcePatientId" TEXT NOT NULL,
    "targetPatientId" TEXT NOT NULL,
    "mergedBy" TEXT NOT NULL,
    "mergedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_merge_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."leads" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fullName" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(30),
    "email" VARCHAR(191),
    "source" VARCHAR(80),
    "campaign" VARCHAR(120),
    "interestType" VARCHAR(80),
    "status" "platform"."LeadStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."lead_profiles" (
    "leadId" TEXT NOT NULL,
    "mainGoal" VARCHAR(120),
    "budgetRange" VARCHAR(80),
    "urgencyLevel" VARCHAR(80),
    "painPoint" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_profiles_pkey" PRIMARY KEY ("leadId")
);

-- CreateTable
CREATE TABLE "crm"."pipelines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."pipeline_stages" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "position" INTEGER NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."lead_stage_history" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."activities" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "assignedUserId" TEXT,
    "activityType" "platform"."ActivityType" NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."loss_reasons" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loss_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."proposals" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "suggestedPlanName" VARCHAR(160),
    "price" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2),
    "status" "platform"."ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."conversions" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "convertedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling"."professionals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "professionalType" "platform"."ProfessionalType" NOT NULL,
    "licenseNumber" VARCHAR(80),
    "displayName" VARCHAR(160) NOT NULL,
    "colorHex" VARCHAR(20),
    "isSchedulable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling"."resources" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "resourceType" "platform"."ResourceType" NOT NULL,
    "code" VARCHAR(60),
    "status" "platform"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling"."calendars" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "calendarType" "platform"."CalendarType" NOT NULL,
    "professionalId" TEXT,
    "resourceId" TEXT,
    "name" VARCHAR(160) NOT NULL,
    "status" "platform"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling"."calendar_rules" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" VARCHAR(8) NOT NULL,
    "endTime" VARCHAR(8) NOT NULL,
    "slotDurationMinutes" INTEGER NOT NULL,
    "breakMinutes" INTEGER,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "calendar_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling"."appointment_types" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "defaultDurationMinutes" INTEGER NOT NULL,
    "requiresProfessional" BOOLEAN NOT NULL DEFAULT true,
    "requiresResource" BOOLEAN NOT NULL DEFAULT false,
    "generatesEncounter" BOOLEAN NOT NULL DEFAULT true,
    "allowsTelehealth" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling"."appointments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "calendarId" TEXT,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT,
    "resourceId" TEXT,
    "appointmentTypeId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "platform"."AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "source" "platform"."AppointmentSource" NOT NULL DEFAULT 'INTERNAL',
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling"."appointment_confirmations" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "channel" "platform"."ConfirmationChannel" NOT NULL,
    "status" "platform"."ConfirmationStatus" NOT NULL,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "metadataJson" JSONB,

    CONSTRAINT "appointment_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling"."checkins" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "checkinType" "platform"."CheckinType" NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedInBy" TEXT,

    CONSTRAINT "checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling"."waitlists" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentTypeId" TEXT NOT NULL,
    "preferredProfessionalId" TEXT,
    "preferredPeriod" VARCHAR(80),
    "status" "platform"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling"."no_show_records" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordedBy" TEXT,
    "reason" TEXT,
    "penaltyApplied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "no_show_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling"."appointment_tags" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "tagCode" VARCHAR(80) NOT NULL,
    "tagLabel" VARCHAR(120) NOT NULL,

    CONSTRAINT "appointment_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."encounters" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "professionalId" TEXT NOT NULL,
    "encounterType" "platform"."EncounterType" NOT NULL,
    "status" "platform"."EncounterStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "encounters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."anamneses" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "chiefComplaint" TEXT,
    "historyOfPresentIllness" TEXT,
    "pastMedicalHistory" TEXT,
    "pastSurgicalHistory" TEXT,
    "familyHistory" TEXT,
    "medicationHistory" TEXT,
    "allergyHistory" TEXT,
    "lifestyleHistory" TEXT,
    "gynecologicalHistory" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anamneses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."consultation_notes" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "noteType" VARCHAR(60),
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "signedBy" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultation_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."care_plans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "currentStatus" VARCHAR(50),
    "summary" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "care_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."care_plan_items" (
    "id" TEXT NOT NULL,
    "carePlanId" TEXT NOT NULL,
    "itemType" VARCHAR(60) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(40),
    "targetDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "care_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."clinical_tasks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "assignedToUserId" TEXT,
    "taskType" VARCHAR(80) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "priority" "platform"."ClinicalTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "platform"."ClinicalTaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "clinical_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."clinical_attachments" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "attachmentType" VARCHAR(80),
    "description" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."adverse_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "severity" "platform"."AdverseEventSeverity" NOT NULL,
    "eventType" VARCHAR(80) NOT NULL,
    "description" TEXT NOT NULL,
    "onsetAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "status" "platform"."AdverseEventStatus" NOT NULL DEFAULT 'ACTIVE',
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adverse_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."problem_lists" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "problemCode" VARCHAR(40),
    "problemName" VARCHAR(160) NOT NULL,
    "status" VARCHAR(40),
    "onsetDate" TIMESTAMP(3),
    "resolvedDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."patient_goals" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "goalType" VARCHAR(80) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "targetValue" VARCHAR(120),
    "currentValue" VARCHAR(120),
    "targetDate" TIMESTAMP(3),
    "status" VARCHAR(40),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."prescription_records" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "prescriptionType" "platform"."PrescriptionType" NOT NULL,
    "summary" TEXT,
    "issuedBy" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."habit_logs" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" VARCHAR(80) NOT NULL,
    "valueText" TEXT,
    "valueNum" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "habit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."hydration_logs" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "volumeMl" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hydration_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."meal_logs" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mealType" VARCHAR(60),
    "description" TEXT,
    "photoFileId" TEXT,
    "adherenceRating" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."workout_logs" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workoutType" VARCHAR(80),
    "durationMinutes" INTEGER,
    "intensity" VARCHAR(40),
    "completed" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."sleep_logs" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "sleepDate" TIMESTAMP(3) NOT NULL,
    "hoursSlept" DOUBLE PRECISION,
    "sleepQualityScore" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sleep_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."symptom_logs" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "symptomType" VARCHAR(80) NOT NULL,
    "severityScore" INTEGER,
    "description" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "symptom_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenants_status_deletedAt_idx" ON "platform"."tenants"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "addresses_tenantId_idx" ON "platform"."addresses"("tenantId");

-- CreateIndex
CREATE INDEX "files_tenantId_createdAt_idx" ON "platform"."files"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "files_uploadedBy_idx" ON "platform"."files"("uploadedBy");

-- CreateIndex
CREATE INDEX "files_ownerType_ownerId_idx" ON "platform"."files"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "platform"."audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_idx" ON "platform"."audit_logs"("actorUserId");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_resourceId_idx" ON "platform"."audit_logs"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "notifications_tenantId_status_scheduledAt_idx" ON "platform"."notifications"("tenantId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "notifications_recipientType_recipientId_idx" ON "platform"."notifications"("recipientType", "recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_tenantId_featureCode_key" ON "platform"."feature_flags"("tenantId", "featureCode");

-- CreateIndex
CREATE INDEX "units_tenantId_status_deletedAt_idx" ON "platform"."units"("tenantId", "status", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "units_tenantId_code_key" ON "platform"."units"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "users_externalAuthId_key" ON "identity"."users"("externalAuthId");

-- CreateIndex
CREATE INDEX "users_tenantId_status_deletedAt_idx" ON "identity"."users"("tenantId", "status", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "identity"."users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenantId_code_key" ON "identity"."roles"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "identity"."permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "identity"."role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_key" ON "identity"."user_roles"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_unit_access_userId_unitId_key" ON "identity"."user_unit_access"("userId", "unitId");

-- CreateIndex
CREATE INDEX "patients_tenantId_status_deletedAt_idx" ON "patients"."patients"("tenantId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "patients_tenantId_fullName_idx" ON "patients"."patients"("tenantId", "fullName");

-- CreateIndex
CREATE INDEX "patients_tenantId_primaryPhone_idx" ON "patients"."patients"("tenantId", "primaryPhone");

-- CreateIndex
CREATE UNIQUE INDEX "patients_tenantId_cpf_key" ON "patients"."patients"("tenantId", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "patient_addresses_patientId_addressId_addressType_key" ON "patients"."patient_addresses"("patientId", "addressId", "addressType");

-- CreateIndex
CREATE INDEX "emergency_contacts_patientId_idx" ON "patients"."emergency_contacts"("patientId");

-- CreateIndex
CREATE INDEX "responsible_parties_tenantId_idx" ON "patients"."responsible_parties"("tenantId");

-- CreateIndex
CREATE INDEX "responsible_parties_patientId_idx" ON "patients"."responsible_parties"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "tags_tenantId_code_key" ON "patients"."tags"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "patient_tags_patientId_tagId_key" ON "patients"."patient_tags"("patientId", "tagId");

-- CreateIndex
CREATE INDEX "patient_flags_tenantId_patientId_active_idx" ON "patients"."patient_flags"("tenantId", "patientId", "active");

-- CreateIndex
CREATE INDEX "patient_merge_history_tenantId_mergedAt_idx" ON "patients"."patient_merge_history"("tenantId", "mergedAt");

-- CreateIndex
CREATE INDEX "leads_tenantId_status_deletedAt_idx" ON "crm"."leads"("tenantId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "leads_tenantId_fullName_idx" ON "crm"."leads"("tenantId", "fullName");

-- CreateIndex
CREATE INDEX "leads_tenantId_phone_idx" ON "crm"."leads"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "pipelines_tenantId_code_key" ON "crm"."pipelines"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_pipelineId_code_key" ON "crm"."pipeline_stages"("pipelineId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_pipelineId_position_key" ON "crm"."pipeline_stages"("pipelineId", "position");

-- CreateIndex
CREATE INDEX "lead_stage_history_leadId_changedAt_idx" ON "crm"."lead_stage_history"("leadId", "changedAt");

-- CreateIndex
CREATE INDEX "activities_leadId_dueAt_idx" ON "crm"."activities"("leadId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "loss_reasons_tenantId_code_key" ON "crm"."loss_reasons"("tenantId", "code");

-- CreateIndex
CREATE INDEX "proposals_leadId_status_idx" ON "crm"."proposals"("leadId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "conversions_leadId_key" ON "crm"."conversions"("leadId");

-- CreateIndex
CREATE INDEX "conversions_patientId_idx" ON "crm"."conversions"("patientId");

-- CreateIndex
CREATE INDEX "professionals_tenantId_professionalType_deletedAt_idx" ON "scheduling"."professionals"("tenantId", "professionalType", "deletedAt");

-- CreateIndex
CREATE INDEX "professionals_userId_idx" ON "scheduling"."professionals"("userId");

-- CreateIndex
CREATE INDEX "resources_tenantId_unitId_status_deletedAt_idx" ON "scheduling"."resources"("tenantId", "unitId", "status", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "resources_tenantId_unitId_code_key" ON "scheduling"."resources"("tenantId", "unitId", "code");

-- CreateIndex
CREATE INDEX "calendars_tenantId_unitId_status_deletedAt_idx" ON "scheduling"."calendars"("tenantId", "unitId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "calendars_professionalId_idx" ON "scheduling"."calendars"("professionalId");

-- CreateIndex
CREATE INDEX "calendars_resourceId_idx" ON "scheduling"."calendars"("resourceId");

-- CreateIndex
CREATE INDEX "calendar_rules_calendarId_weekday_isActive_idx" ON "scheduling"."calendar_rules"("calendarId", "weekday", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_types_tenantId_code_key" ON "scheduling"."appointment_types"("tenantId", "code");

-- CreateIndex
CREATE INDEX "appointments_tenantId_unitId_startsAt_idx" ON "scheduling"."appointments"("tenantId", "unitId", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_patientId_startsAt_idx" ON "scheduling"."appointments"("patientId", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_professionalId_startsAt_idx" ON "scheduling"."appointments"("professionalId", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_resourceId_startsAt_idx" ON "scheduling"."appointments"("resourceId", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_status_startsAt_idx" ON "scheduling"."appointments"("status", "startsAt");

-- CreateIndex
CREATE INDEX "appointment_confirmations_appointmentId_status_idx" ON "scheduling"."appointment_confirmations"("appointmentId", "status");

-- CreateIndex
CREATE INDEX "checkins_appointmentId_checkedInAt_idx" ON "scheduling"."checkins"("appointmentId", "checkedInAt");

-- CreateIndex
CREATE INDEX "waitlists_tenantId_unitId_status_idx" ON "scheduling"."waitlists"("tenantId", "unitId", "status");

-- CreateIndex
CREATE INDEX "waitlists_patientId_idx" ON "scheduling"."waitlists"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "no_show_records_appointmentId_key" ON "scheduling"."no_show_records"("appointmentId");

-- CreateIndex
CREATE INDEX "no_show_records_patientId_createdAt_idx" ON "scheduling"."no_show_records"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "appointment_tags_appointmentId_idx" ON "scheduling"."appointment_tags"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "encounters_appointmentId_key" ON "clinical"."encounters"("appointmentId");

-- CreateIndex
CREATE INDEX "encounters_tenantId_unitId_openedAt_idx" ON "clinical"."encounters"("tenantId", "unitId", "openedAt");

-- CreateIndex
CREATE INDEX "encounters_patientId_openedAt_idx" ON "clinical"."encounters"("patientId", "openedAt");

-- CreateIndex
CREATE INDEX "encounters_professionalId_openedAt_idx" ON "clinical"."encounters"("professionalId", "openedAt");

-- CreateIndex
CREATE INDEX "encounters_status_openedAt_idx" ON "clinical"."encounters"("status", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "anamneses_encounterId_key" ON "clinical"."anamneses"("encounterId");

-- CreateIndex
CREATE INDEX "consultation_notes_encounterId_createdAt_idx" ON "clinical"."consultation_notes"("encounterId", "createdAt");

-- CreateIndex
CREATE INDEX "care_plans_tenantId_patientId_deletedAt_idx" ON "clinical"."care_plans"("tenantId", "patientId", "deletedAt");

-- CreateIndex
CREATE INDEX "care_plan_items_carePlanId_status_idx" ON "clinical"."care_plan_items"("carePlanId", "status");

-- CreateIndex
CREATE INDEX "clinical_tasks_tenantId_status_dueAt_idx" ON "clinical"."clinical_tasks"("tenantId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "clinical_tasks_patientId_status_idx" ON "clinical"."clinical_tasks"("patientId", "status");

-- CreateIndex
CREATE INDEX "clinical_tasks_assignedToUserId_status_idx" ON "clinical"."clinical_tasks"("assignedToUserId", "status");

-- CreateIndex
CREATE INDEX "clinical_attachments_encounterId_uploadedAt_idx" ON "clinical"."clinical_attachments"("encounterId", "uploadedAt");

-- CreateIndex
CREATE INDEX "adverse_events_tenantId_createdAt_idx" ON "clinical"."adverse_events"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "adverse_events_patientId_status_idx" ON "clinical"."adverse_events"("patientId", "status");

-- CreateIndex
CREATE INDEX "problem_lists_patientId_status_idx" ON "clinical"."problem_lists"("patientId", "status");

-- CreateIndex
CREATE INDEX "patient_goals_patientId_status_targetDate_idx" ON "clinical"."patient_goals"("patientId", "status", "targetDate");

-- CreateIndex
CREATE INDEX "prescription_records_encounterId_issuedAt_idx" ON "clinical"."prescription_records"("encounterId", "issuedAt");

-- CreateIndex
CREATE INDEX "prescription_records_patientId_issuedAt_idx" ON "clinical"."prescription_records"("patientId", "issuedAt");

-- CreateIndex
CREATE INDEX "habit_logs_patientId_loggedAt_idx" ON "clinical"."habit_logs"("patientId", "loggedAt");

-- CreateIndex
CREATE INDEX "hydration_logs_patientId_loggedAt_idx" ON "clinical"."hydration_logs"("patientId", "loggedAt");

-- CreateIndex
CREATE INDEX "meal_logs_patientId_loggedAt_idx" ON "clinical"."meal_logs"("patientId", "loggedAt");

-- CreateIndex
CREATE INDEX "workout_logs_patientId_loggedAt_idx" ON "clinical"."workout_logs"("patientId", "loggedAt");

-- CreateIndex
CREATE INDEX "sleep_logs_patientId_sleepDate_idx" ON "clinical"."sleep_logs"("patientId", "sleepDate");

-- CreateIndex
CREATE INDEX "symptom_logs_patientId_loggedAt_idx" ON "clinical"."symptom_logs"("patientId", "loggedAt");

-- AddForeignKey
ALTER TABLE "platform"."addresses" ADD CONSTRAINT "addresses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."files" ADD CONSTRAINT "files_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."files" ADD CONSTRAINT "files_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."feature_flags" ADD CONSTRAINT "feature_flags_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."units" ADD CONSTRAINT "units_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."units" ADD CONSTRAINT "units_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "platform"."addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."roles" ADD CONSTRAINT "roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "identity"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "identity"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "identity"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."user_unit_access" ADD CONSTRAINT "user_unit_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."user_unit_access" ADD CONSTRAINT "user_unit_access_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "platform"."units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients"."patients" ADD CONSTRAINT "patients_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients"."patient_profiles" ADD CONSTRAINT "patient_profiles_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients"."patient_addresses" ADD CONSTRAINT "patient_addresses_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients"."patient_addresses" ADD CONSTRAINT "patient_addresses_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "platform"."addresses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients"."emergency_contacts" ADD CONSTRAINT "emergency_contacts_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients"."responsible_parties" ADD CONSTRAINT "responsible_parties_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients"."responsible_parties" ADD CONSTRAINT "responsible_parties_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients"."responsible_parties" ADD CONSTRAINT "responsible_parties_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "platform"."addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients"."tags" ADD CONSTRAINT "tags_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients"."patient_tags" ADD CONSTRAINT "patient_tags_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients"."patient_tags" ADD CONSTRAINT "patient_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "patients"."tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients"."patient_flags" ADD CONSTRAINT "patient_flags_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients"."patient_flags" ADD CONSTRAINT "patient_flags_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients"."patient_flags" ADD CONSTRAINT "patient_flags_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients"."patient_merge_history" ADD CONSTRAINT "patient_merge_history_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients"."patient_merge_history" ADD CONSTRAINT "patient_merge_history_sourcePatientId_fkey" FOREIGN KEY ("sourcePatientId") REFERENCES "patients"."patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients"."patient_merge_history" ADD CONSTRAINT "patient_merge_history_targetPatientId_fkey" FOREIGN KEY ("targetPatientId") REFERENCES "patients"."patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients"."patient_merge_history" ADD CONSTRAINT "patient_merge_history_mergedBy_fkey" FOREIGN KEY ("mergedBy") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."leads" ADD CONSTRAINT "leads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."lead_profiles" ADD CONSTRAINT "lead_profiles_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm"."leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."pipelines" ADD CONSTRAINT "pipelines_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "crm"."pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."lead_stage_history" ADD CONSTRAINT "lead_stage_history_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm"."leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."lead_stage_history" ADD CONSTRAINT "lead_stage_history_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "crm"."pipeline_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."lead_stage_history" ADD CONSTRAINT "lead_stage_history_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."activities" ADD CONSTRAINT "activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm"."leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."activities" ADD CONSTRAINT "activities_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."loss_reasons" ADD CONSTRAINT "loss_reasons_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."proposals" ADD CONSTRAINT "proposals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm"."leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."proposals" ADD CONSTRAINT "proposals_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."conversions" ADD CONSTRAINT "conversions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm"."leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."conversions" ADD CONSTRAINT "conversions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."conversions" ADD CONSTRAINT "conversions_convertedBy_fkey" FOREIGN KEY ("convertedBy") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."professionals" ADD CONSTRAINT "professionals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."professionals" ADD CONSTRAINT "professionals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."resources" ADD CONSTRAINT "resources_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."resources" ADD CONSTRAINT "resources_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "platform"."units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."calendars" ADD CONSTRAINT "calendars_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."calendars" ADD CONSTRAINT "calendars_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "platform"."units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."calendars" ADD CONSTRAINT "calendars_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "scheduling"."professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."calendars" ADD CONSTRAINT "calendars_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "scheduling"."resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."calendar_rules" ADD CONSTRAINT "calendar_rules_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "scheduling"."calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."appointment_types" ADD CONSTRAINT "appointment_types_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."appointments" ADD CONSTRAINT "appointments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."appointments" ADD CONSTRAINT "appointments_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "platform"."units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."appointments" ADD CONSTRAINT "appointments_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "scheduling"."calendars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."appointments" ADD CONSTRAINT "appointments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."appointments" ADD CONSTRAINT "appointments_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "scheduling"."professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."appointments" ADD CONSTRAINT "appointments_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "scheduling"."resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."appointments" ADD CONSTRAINT "appointments_appointmentTypeId_fkey" FOREIGN KEY ("appointmentTypeId") REFERENCES "scheduling"."appointment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."appointments" ADD CONSTRAINT "appointments_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."appointment_confirmations" ADD CONSTRAINT "appointment_confirmations_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "scheduling"."appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."checkins" ADD CONSTRAINT "checkins_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "scheduling"."appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."checkins" ADD CONSTRAINT "checkins_checkedInBy_fkey" FOREIGN KEY ("checkedInBy") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."waitlists" ADD CONSTRAINT "waitlists_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."waitlists" ADD CONSTRAINT "waitlists_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "platform"."units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."waitlists" ADD CONSTRAINT "waitlists_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."waitlists" ADD CONSTRAINT "waitlists_appointmentTypeId_fkey" FOREIGN KEY ("appointmentTypeId") REFERENCES "scheduling"."appointment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."waitlists" ADD CONSTRAINT "waitlists_preferredProfessionalId_fkey" FOREIGN KEY ("preferredProfessionalId") REFERENCES "scheduling"."professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."no_show_records" ADD CONSTRAINT "no_show_records_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "scheduling"."appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."no_show_records" ADD CONSTRAINT "no_show_records_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."no_show_records" ADD CONSTRAINT "no_show_records_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling"."appointment_tags" ADD CONSTRAINT "appointment_tags_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "scheduling"."appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."encounters" ADD CONSTRAINT "encounters_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."encounters" ADD CONSTRAINT "encounters_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."encounters" ADD CONSTRAINT "encounters_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "platform"."units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."encounters" ADD CONSTRAINT "encounters_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "scheduling"."appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."encounters" ADD CONSTRAINT "encounters_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "scheduling"."professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."anamneses" ADD CONSTRAINT "anamneses_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical"."encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."consultation_notes" ADD CONSTRAINT "consultation_notes_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical"."encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."consultation_notes" ADD CONSTRAINT "consultation_notes_signedBy_fkey" FOREIGN KEY ("signedBy") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."care_plans" ADD CONSTRAINT "care_plans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."care_plans" ADD CONSTRAINT "care_plans_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."care_plans" ADD CONSTRAINT "care_plans_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."care_plan_items" ADD CONSTRAINT "care_plan_items_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "clinical"."care_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_tasks" ADD CONSTRAINT "clinical_tasks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_tasks" ADD CONSTRAINT "clinical_tasks_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_tasks" ADD CONSTRAINT "clinical_tasks_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical"."encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_tasks" ADD CONSTRAINT "clinical_tasks_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_attachments" ADD CONSTRAINT "clinical_attachments_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical"."encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_attachments" ADD CONSTRAINT "clinical_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "platform"."files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."adverse_events" ADD CONSTRAINT "adverse_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."adverse_events" ADD CONSTRAINT "adverse_events_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."adverse_events" ADD CONSTRAINT "adverse_events_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical"."encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."adverse_events" ADD CONSTRAINT "adverse_events_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."problem_lists" ADD CONSTRAINT "problem_lists_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."patient_goals" ADD CONSTRAINT "patient_goals_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."patient_goals" ADD CONSTRAINT "patient_goals_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."prescription_records" ADD CONSTRAINT "prescription_records_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical"."encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."prescription_records" ADD CONSTRAINT "prescription_records_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."prescription_records" ADD CONSTRAINT "prescription_records_issuedBy_fkey" FOREIGN KEY ("issuedBy") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."habit_logs" ADD CONSTRAINT "habit_logs_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."hydration_logs" ADD CONSTRAINT "hydration_logs_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."meal_logs" ADD CONSTRAINT "meal_logs_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."meal_logs" ADD CONSTRAINT "meal_logs_photoFileId_fkey" FOREIGN KEY ("photoFileId") REFERENCES "platform"."files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."workout_logs" ADD CONSTRAINT "workout_logs_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."sleep_logs" ADD CONSTRAINT "sleep_logs_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."symptom_logs" ADD CONSTRAINT "symptom_logs_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
