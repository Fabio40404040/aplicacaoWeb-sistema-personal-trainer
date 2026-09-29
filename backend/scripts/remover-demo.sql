-- =====================================================================
-- REMOVE A CONTA DE DEMONSTRAÇÃO (uma vez só)
-- Apaga o personal demo@farisa.example, os alunos fictícios e tudo que
-- pertence a eles. Nenhuma outra conta é tocada.
--   npm run demo:remover   (na pasta principal: computador e site publicado)
-- =====================================================================
DELETE FROM workout_exercises WHERE workout_id IN (SELECT id FROM workouts WHERE trainer_id='demo-trainer');
DELETE FROM ready_program_exercises WHERE program_id IN (SELECT id FROM ready_workout_programs WHERE trainer_id='demo-trainer');
DELETE FROM workout_logs WHERE trainer_id='demo-trainer';
DELETE FROM checkins WHERE trainer_id='demo-trainer';
DELETE FROM payments WHERE trainer_id='demo-trainer';
DELETE FROM payment_intents WHERE trainer_id='demo-trainer';
DELETE FROM appointments WHERE trainer_id='demo-trainer';
DELETE FROM access_history WHERE trainer_id='demo-trainer';
DELETE FROM assessments WHERE trainer_id='demo-trainer';
DELETE FROM workouts WHERE trainer_id='demo-trainer';
DELETE FROM ready_workout_programs WHERE trainer_id='demo-trainer';
DELETE FROM ready_workout_pdfs WHERE trainer_id='demo-trainer';
DELETE FROM exercise_videos WHERE trainer_id='demo-trainer';
DELETE FROM exercise_gifs WHERE trainer_id='demo-trainer';
DELETE FROM trainer_muscle_groups WHERE trainer_id='demo-trainer';
DELETE FROM student_password_resets WHERE account_id IN (SELECT id FROM student_accounts WHERE trainer_id='demo-trainer' OR lower(email) IN ('aluno.demo@farisa.example','aluno.pronto@farisa.example'));
DELETE FROM student_accounts WHERE trainer_id='demo-trainer' OR lower(email) IN ('aluno.demo@farisa.example','aluno.pronto@farisa.example');
DELETE FROM students WHERE trainer_id='demo-trainer';
DELETE FROM exercises WHERE trainer_id='demo-trainer';
DELETE FROM trainer_password_resets WHERE trainer_id='demo-trainer';
DELETE FROM trainers WHERE id='demo-trainer' OR lower(email)='demo@farisa.example';
