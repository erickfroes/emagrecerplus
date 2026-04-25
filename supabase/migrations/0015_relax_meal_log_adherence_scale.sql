alter table clinical.meal_logs
drop constraint if exists meal_logs_adherence_rating_check;

alter table clinical.meal_logs
add constraint meal_logs_adherence_rating_check
check (adherence_rating between 1 and 10);
