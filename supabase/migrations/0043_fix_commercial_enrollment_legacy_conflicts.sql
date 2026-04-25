drop index if exists commercial.idx_commercial_patient_program_enrollments_legacy_id;
drop index if exists commercial.idx_commercial_patient_entitlements_legacy_id;

create unique index if not exists idx_commercial_patient_program_enrollments_legacy_id
  on commercial.patient_program_enrollments (legacy_enrollment_id);

create unique index if not exists idx_commercial_patient_entitlements_legacy_id
  on commercial.patient_entitlements (legacy_entitlement_id);
