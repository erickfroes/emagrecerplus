drop index if exists clinical.idx_clinical_nutrition_plans_legacy_id;
create unique index if not exists idx_clinical_nutrition_plans_legacy_id
  on clinical.nutrition_plans (legacy_nutrition_plan_id);

drop index if exists clinical.idx_clinical_nutrition_plan_versions_legacy_id;
create unique index if not exists idx_clinical_nutrition_plan_versions_legacy_id
  on clinical.nutrition_plan_versions (legacy_nutrition_version_id);

drop index if exists clinical.idx_clinical_nutrition_targets_legacy_id;
create unique index if not exists idx_clinical_nutrition_targets_legacy_id
  on clinical.nutrition_targets (legacy_target_id);
