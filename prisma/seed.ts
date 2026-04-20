import 'dotenv/config';
import { PrismaClient, ProfessionalType, UserStatus } from '../generated/prisma/client/client';
import { PrismaPg } from '@prisma/adapter-pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definida no ambiente.');
}

const adapter = new PrismaPg(process.env.DATABASE_URL);

const prisma = new PrismaClient({
  adapter,
  log: ['warn', 'error'],
});

type PermissionSeed = {
  code: string;
  description: string;
  moduleCode: string;
};

type RoleSeed = {
  name: string;
  code: string;
  description: string;
  permissions: string[];
};

async function upsertPermission(permission: PermissionSeed) {
  return prisma.permission.upsert({
    where: { code: permission.code },
    update: {
      description: permission.description,
      moduleCode: permission.moduleCode,
    },
    create: permission,
  });
}

async function main() {
  console.log('🌱 Iniciando seed...');

  //////////////////////////////////////////////////////
  // 1. TENANT DEMO
  //////////////////////////////////////////////////////

  const tenant = await prisma.tenant.upsert({
    where: {
      id: 'seed-tenant-main',
    },
    update: {
      legalName: 'Clínica Performance Corporal LTDA',
      tradeName: 'Performance Clinic',
      documentNumber: '00.000.000/0001-00',
      subscriptionPlanCode: 'growth',
      deletedAt: null,
    },
    create: {
      id: 'seed-tenant-main',
      legalName: 'Clínica Performance Corporal LTDA',
      tradeName: 'Performance Clinic',
      documentNumber: '00.000.000/0001-00',
      subscriptionPlanCode: 'growth',
    },
  });

  console.log(`✅ Tenant: ${tenant.tradeName}`);

  //////////////////////////////////////////////////////
  // 2. ENDEREÇO E UNIDADE PRINCIPAL
  //////////////////////////////////////////////////////

  const mainAddress = await prisma.address.create({
    data: {
      tenantId: tenant.id,
      street: 'Rua Exemplo',
      number: '100',
      district: 'Centro',
      city: 'Imperatriz',
      state: 'MA',
      zipCode: '65900-000',
      country: 'BR',
    },
  }).catch(async () => {
    const existing = await prisma.address.findFirst({
      where: {
        tenantId: tenant.id,
        street: 'Rua Exemplo',
        number: '100',
      },
    });
    if (!existing) throw new Error('Falha ao criar ou recuperar address seed');
    return existing;
  });

  const mainUnit = await prisma.unit.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: 'MATRIZ',
      },
    },
    update: {
      name: 'Unidade Matriz',
      timezone: 'America/Fortaleza',
      addressId: mainAddress.id,
      deletedAt: null,
    },
    create: {
      tenantId: tenant.id,
      name: 'Unidade Matriz',
      code: 'MATRIZ',
      timezone: 'America/Fortaleza',
      addressId: mainAddress.id,
    },
  });

  console.log(`✅ Unidade: ${mainUnit.name}`);

  //////////////////////////////////////////////////////
  // 3. PERMISSÕES
  //////////////////////////////////////////////////////

  const permissions: PermissionSeed[] = [
    // platform
    { code: 'platform.read', description: 'Visualizar dados da plataforma', moduleCode: 'platform' },

    // identity
    { code: 'users.read', description: 'Visualizar usuários', moduleCode: 'identity' },
    { code: 'users.write', description: 'Criar e editar usuários', moduleCode: 'identity' },
    { code: 'roles.read', description: 'Visualizar papéis e permissões', moduleCode: 'identity' },
    { code: 'roles.write', description: 'Editar papéis e permissões', moduleCode: 'identity' },

    // patients
    { code: 'patients.read', description: 'Visualizar pacientes', moduleCode: 'patients' },
    { code: 'patients.write', description: 'Criar e editar pacientes', moduleCode: 'patients' },
    { code: 'patients.flags.write', description: 'Criar e editar flags de pacientes', moduleCode: 'patients' },

    // crm
    { code: 'crm.read', description: 'Visualizar leads e CRM', moduleCode: 'crm' },
    { code: 'crm.write', description: 'Criar e editar leads e CRM', moduleCode: 'crm' },
    { code: 'crm.convert', description: 'Converter lead em paciente', moduleCode: 'crm' },
    { code: 'crm.proposals.write', description: 'Criar propostas comerciais', moduleCode: 'crm' },

    // scheduling
    { code: 'schedule.read', description: 'Visualizar agenda', moduleCode: 'scheduling' },
    { code: 'schedule.write', description: 'Criar e editar agenda', moduleCode: 'scheduling' },
    { code: 'schedule.checkin', description: 'Realizar check-in', moduleCode: 'scheduling' },
    { code: 'schedule.no_show.write', description: 'Registrar no-show', moduleCode: 'scheduling' },

    // clinical
    { code: 'clinical.read', description: 'Visualizar prontuário', moduleCode: 'clinical' },
    { code: 'clinical.write', description: 'Criar e editar prontuário', moduleCode: 'clinical' },
    { code: 'clinical.sign', description: 'Assinar evolução clínica', moduleCode: 'clinical' },
    { code: 'clinical.tasks.write', description: 'Criar tarefas clínicas', moduleCode: 'clinical' },
    { code: 'clinical.adverse_events.write', description: 'Registrar eventos adversos', moduleCode: 'clinical' },
    { code: 'clinical.prescriptions.write', description: 'Registrar prescrições', moduleCode: 'clinical' },

    // audit
    { code: 'audit.read', description: 'Visualizar trilhas de auditoria', moduleCode: 'platform' },
  ];

  for (const permission of permissions) {
    await upsertPermission(permission);
  }

  console.log(`✅ Permissões: ${permissions.length}`);

  //////////////////////////////////////////////////////
  // 4. PAPÉIS
  //////////////////////////////////////////////////////

  const roles: RoleSeed[] = [
    {
      name: 'Administrador',
      code: 'admin',
      description: 'Acesso administrativo completo da clínica',
      permissions: permissions.map((p) => p.code),
    },
    {
      name: 'Médico',
      code: 'physician',
      description: 'Profissional médico com acesso clínico amplo',
      permissions: [
        'patients.read',
        'patients.write',
        'patients.flags.write',
        'crm.read',
        'schedule.read',
        'schedule.write',
        'clinical.read',
        'clinical.write',
        'clinical.sign',
        'clinical.tasks.write',
        'clinical.adverse_events.write',
        'clinical.prescriptions.write',
      ],
    },
    {
      name: 'Nutricionista',
      code: 'nutritionist',
      description: 'Profissional de nutrição',
      permissions: [
        'patients.read',
        'patients.write',
        'schedule.read',
        'schedule.write',
        'clinical.read',
        'clinical.write',
        'clinical.tasks.write',
      ],
    },
    {
      name: 'Recepção',
      code: 'reception',
      description: 'Equipe de recepção e atendimento inicial',
      permissions: [
        'patients.read',
        'patients.write',
        'crm.read',
        'crm.write',
        'crm.convert',
        'crm.proposals.write',
        'schedule.read',
        'schedule.write',
        'schedule.checkin',
        'schedule.no_show.write',
      ],
    },
    {
      name: 'Comercial',
      code: 'sales',
      description: 'Equipe comercial',
      permissions: [
        'crm.read',
        'crm.write',
        'crm.convert',
        'crm.proposals.write',
        'patients.read',
        'schedule.read',
        'schedule.write',
      ],
    },
    {
      name: 'Enfermagem',
      code: 'nursing',
      description: 'Equipe assistencial operacional',
      permissions: [
        'patients.read',
        'schedule.read',
        'schedule.write',
        'schedule.checkin',
        'clinical.read',
        'clinical.write',
        'clinical.tasks.write',
        'clinical.adverse_events.write',
      ],
    },
    {
      name: 'Financeiro',
      code: 'financial',
      description: 'Equipe financeira',
      permissions: [
        'patients.read',
        'crm.read',
        'schedule.read',
        'audit.read',
      ],
    },
  ];

  for (const roleData of roles) {
    const role = await prisma.role.upsert({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: roleData.code,
        },
      },
      update: {
        name: roleData.name,
        description: roleData.description,
      },
      create: {
        tenantId: tenant.id,
        name: roleData.name,
        code: roleData.code,
        description: roleData.description,
      },
    });

    const permissionRecords = await prisma.permission.findMany({
      where: {
        code: { in: roleData.permissions },
      },
      select: { id: true, code: true },
    });

    const existingLinks = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionId: true },
    });

    const existingSet = new Set(existingLinks.map((x) => x.permissionId));

    for (const permission of permissionRecords) {
      if (!existingSet.has(permission.id)) {
        await prisma.rolePermission.create({
          data: {
            roleId: role.id,
            permissionId: permission.id,
          },
        });
      }
    }
  }

  console.log(`✅ Papéis: ${roles.length}`);

  //////////////////////////////////////////////////////
  // 5. USUÁRIOS BASE
  //////////////////////////////////////////////////////

  const users = [
    {
      key: 'admin',
      fullName: 'Administrador Principal',
      email: 'admin@performanceclinic.com',
      status: UserStatus.ACTIVE,
      roleCode: 'admin',
      professionalType: null as ProfessionalType | null,
      displayName: null as string | null,
    },
    {
      key: 'doctor',
      fullName: 'Dr. Erick Froes',
      email: 'doctor@performanceclinic.com',
      status: UserStatus.ACTIVE,
      roleCode: 'physician',
      professionalType: ProfessionalType.PHYSICIAN,
      displayName: 'Dr. Erick Froes',
    },
    {
      key: 'nutrition',
      fullName: 'Nutricionista Performance',
      email: 'nutrition@performanceclinic.com',
      status: UserStatus.ACTIVE,
      roleCode: 'nutritionist',
      professionalType: ProfessionalType.NUTRITIONIST,
      displayName: 'Nutricionista Performance',
    },
    {
      key: 'reception',
      fullName: 'Recepção Principal',
      email: 'reception@performanceclinic.com',
      status: UserStatus.ACTIVE,
      roleCode: 'reception',
      professionalType: null,
      displayName: null,
    },
    {
      key: 'sales',
      fullName: 'Comercial Principal',
      email: 'sales@performanceclinic.com',
      status: UserStatus.ACTIVE,
      roleCode: 'sales',
      professionalType: null,
      displayName: null,
    },
    {
      key: 'nurse',
      fullName: 'Enfermagem Principal',
      email: 'nurse@performanceclinic.com',
      status: UserStatus.ACTIVE,
      roleCode: 'nursing',
      professionalType: ProfessionalType.NURSE,
      displayName: 'Enfermagem Principal',
    },
  ];

  const createdUsers = new Map<string, { id: string; email: string }>();

  for (const userData of users) {
    const user = await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: tenant.id,
          email: userData.email,
        },
      },
      update: {
        fullName: userData.fullName,
        status: userData.status,
        deletedAt: null,
      },
      create: {
        tenantId: tenant.id,
        fullName: userData.fullName,
        email: userData.email,
        status: userData.status,
      },
      select: {
        id: true,
        email: true,
      },
    });

    createdUsers.set(userData.key, user);

    const role = await prisma.role.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: userData.roleCode,
        },
      },
      select: { id: true },
    });

    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId: role.id,
      },
    });

    await prisma.userUnitAccess.upsert({
      where: {
        userId_unitId: {
          userId: user.id,
          unitId: mainUnit.id,
        },
      },
      update: {
        accessLevel: 'FULL',
      },
      create: {
        userId: user.id,
        unitId: mainUnit.id,
        accessLevel: 'FULL',
      },
    });

    if (userData.professionalType && userData.displayName) {
      const existingProfessional = await prisma.professional.findFirst({
        where: {
          tenantId: tenant.id,
          userId: user.id,
        },
        select: { id: true },
      });

      if (!existingProfessional) {
        await prisma.professional.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            professionalType: userData.professionalType,
            displayName: userData.displayName,
            isSchedulable: true,
          },
        });
      }
    }
  }

  console.log(`✅ Usuários base: ${users.length}`);

  //////////////////////////////////////////////////////
  // 6. PIPELINE PADRÃO
  //////////////////////////////////////////////////////

  const pipeline = await prisma.pipeline.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: 'default-sales',
      },
    },
    update: {
      name: 'Funil Comercial Padrão',
      active: true,
    },
    create: {
      tenantId: tenant.id,
      name: 'Funil Comercial Padrão',
      code: 'default-sales',
      active: true,
    },
  });

  const stageSeeds = [
    { name: 'Novo Lead', code: 'new', position: 1, isFinal: false },
    { name: 'Contato Realizado', code: 'contacted', position: 2, isFinal: false },
    { name: 'Qualificado', code: 'qualified', position: 3, isFinal: false },
    { name: 'Consulta Agendada', code: 'appointment_booked', position: 4, isFinal: false },
    { name: 'Proposta Enviada', code: 'proposal_sent', position: 5, isFinal: false },
    { name: 'Fechado', code: 'won', position: 6, isFinal: true },
    { name: 'Perdido', code: 'lost', position: 7, isFinal: true },
  ];

  for (const stage of stageSeeds) {
    await prisma.pipelineStage.upsert({
      where: {
        pipelineId_code: {
          pipelineId: pipeline.id,
          code: stage.code,
        },
      },
      update: {
        name: stage.name,
        position: stage.position,
        isFinal: stage.isFinal,
      },
      create: {
        pipelineId: pipeline.id,
        name: stage.name,
        code: stage.code,
        position: stage.position,
        isFinal: stage.isFinal,
      },
    });
  }

  console.log(`✅ Pipeline e etapas criados`);

  //////////////////////////////////////////////////////
  // 7. MOTIVOS DE PERDA
  //////////////////////////////////////////////////////

  const lossReasons = [
    { name: 'Preço', code: 'price' },
    { name: 'Sem interesse no momento', code: 'no_interest_now' },
    { name: 'Não respondeu', code: 'no_response' },
    { name: 'Escolheu concorrente', code: 'competitor' },
    { name: 'Sem disponibilidade de agenda', code: 'schedule_conflict' },
  ];

  for (const lossReason of lossReasons) {
    await prisma.lossReason.upsert({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: lossReason.code,
        },
      },
      update: {
        name: lossReason.name,
      },
      create: {
        tenantId: tenant.id,
        name: lossReason.name,
        code: lossReason.code,
      },
    });
  }

  console.log(`✅ Motivos de perda criados`);

  //////////////////////////////////////////////////////
  // 8. APPOINTMENT TYPES PADRÃO
  //////////////////////////////////////////////////////

  const appointmentTypes = [
    {
      name: 'Consulta Inicial',
      code: 'initial_consult',
      defaultDurationMinutes: 60,
      requiresProfessional: true,
      requiresResource: false,
      generatesEncounter: true,
      allowsTelehealth: false,
    },
    {
      name: 'Retorno',
      code: 'follow_up',
      defaultDurationMinutes: 30,
      requiresProfessional: true,
      requiresResource: false,
      generatesEncounter: true,
      allowsTelehealth: true,
    },
    {
      name: 'Avaliação Corporal',
      code: 'body_assessment',
      defaultDurationMinutes: 30,
      requiresProfessional: true,
      requiresResource: true,
      generatesEncounter: true,
      allowsTelehealth: false,
    },
    {
      name: 'Aplicação / Procedimento',
      code: 'procedure',
      defaultDurationMinutes: 45,
      requiresProfessional: true,
      requiresResource: true,
      generatesEncounter: true,
      allowsTelehealth: false,
    },
    {
      name: 'Revisão de Exames',
      code: 'exam_review',
      defaultDurationMinutes: 30,
      requiresProfessional: true,
      requiresResource: false,
      generatesEncounter: true,
      allowsTelehealth: true,
    },
  ];

  for (const appointmentType of appointmentTypes) {
    await prisma.appointmentType.upsert({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: appointmentType.code,
        },
      },
      update: {
        name: appointmentType.name,
        defaultDurationMinutes: appointmentType.defaultDurationMinutes,
        requiresProfessional: appointmentType.requiresProfessional,
        requiresResource: appointmentType.requiresResource,
        generatesEncounter: appointmentType.generatesEncounter,
        allowsTelehealth: appointmentType.allowsTelehealth,
        active: true,
      },
      create: {
        tenantId: tenant.id,
        ...appointmentType,
        active: true,
      },
    });
  }

  console.log(`✅ Tipos de atendimento criados`);

  //////////////////////////////////////////////////////
  // 9. TAGS PADRÃO DE PACIENTE
  //////////////////////////////////////////////////////

  const tags = [
    { name: 'Emagrecimento', code: 'weight_loss', color: '#2563EB' },
    { name: 'Hipertrofia', code: 'hypertrophy', color: '#059669' },
    { name: 'Manutenção', code: 'maintenance', color: '#7C3AED' },
    { name: 'Risco de Abandono', code: 'dropout_risk', color: '#DC2626' },
    { name: 'VIP', code: 'vip', color: '#D97706' },
    { name: 'No-show Recorrente', code: 'recurrent_no_show', color: '#B91C1C' },
    { name: 'Modulação Corporal', code: 'body_modulation', color: '#0F766E' },
  ];

  for (const tag of tags) {
    await prisma.tag.upsert({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: tag.code,
        },
      },
      update: {
        name: tag.name,
        color: tag.color,
      },
      create: {
        tenantId: tenant.id,
        ...tag,
      },
    });
  }

  console.log(`✅ Tags padrão criadas`);

  //////////////////////////////////////////////////////
  // 10. EXEMPLO DE LEAD SEED
  //////////////////////////////////////////////////////

  const salesUser = createdUsers.get('sales');
  const defaultNewStage = await prisma.pipelineStage.findUniqueOrThrow({
    where: {
      pipelineId_code: {
        pipelineId: pipeline.id,
        code: 'new',
      },
    },
    select: { id: true },
  });

  const sampleLead = await prisma.lead.create({
    data: {
      tenantId: tenant.id,
      fullName: 'Lead Exemplo',
      phone: '(99) 99999-0000',
      email: 'lead.exemplo@email.com',
      source: 'instagram',
      campaign: 'campanha-mounjaro-01',
      interestType: 'weight_loss',
      status: 'NEW',
      profile: {
        create: {
          mainGoal: 'Perda de peso',
          budgetRange: 'premium',
          urgencyLevel: 'high',
          painPoint: 'Não consegue manter consistência',
        },
      },
      activities: salesUser
        ? {
            create: [
              {
                assignedUserId: salesUser.id,
                activityType: 'TASK',
                description: 'Realizar primeiro contato em até 5 minutos',
              },
            ],
          }
        : undefined,
      stageHistory: salesUser
        ? {
            create: [
              {
                stageId: defaultNewStage.id,
                changedBy: salesUser.id,
              },
            ],
          }
        : undefined,
    },
    select: { id: true },
  }).catch(async () => {
    const existing = await prisma.lead.findFirst({
      where: {
        tenantId: tenant.id,
        email: 'lead.exemplo@email.com',
      },
      select: { id: true },
    });
    if (!existing) throw new Error('Falha ao criar ou recuperar lead de exemplo');
    return existing;
  });

  console.log(`✅ Lead exemplo: ${sampleLead.id}`);

  console.log('🎉 Seed concluído com sucesso.');
}

main()
  .catch((error) => {
    console.error('❌ Erro no seed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });