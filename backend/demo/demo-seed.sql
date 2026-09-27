-- =====================================================================
-- CONTA DE DEMONSTRAÇÃO (portfólio)
-- Apaga e recria a conta demo com dados fictícios. Pode rodar quantas vezes
-- quiser: nada fora da conta demo é tocado.
--   Personal: demo@farisa.example      / Demo@2026
--   Aluno:    aluno.demo@farisa.example / Demo@2026
-- Uso (na pasta backend):
--   npm run demo:reset:local   -> banco do computador
--   npm run demo:reset:remote  -> banco do site publicado
-- =====================================================================

-- 1) Limpa a demo anterior (filhos antes dos pais, por causa das chaves).
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
DELETE FROM student_password_resets WHERE account_id IN (SELECT id FROM student_accounts WHERE trainer_id='demo-trainer' OR lower(email)='aluno.demo@farisa.example');
DELETE FROM student_accounts WHERE trainer_id='demo-trainer' OR lower(email)='aluno.demo@farisa.example';
DELETE FROM students WHERE trainer_id='demo-trainer';
DELETE FROM exercises WHERE trainer_id='demo-trainer';
DELETE FROM trainer_password_resets WHERE trainer_id='demo-trainer';
DELETE FROM trainers WHERE id='demo-trainer' OR lower(email)='demo@farisa.example';

-- 2) Personal de demonstração.
INSERT INTO trainers (id,name,email,password_hash,phone,cref,bio,plan_name,student_limit)
VALUES ('demo-trainer','Visitante Demonstração','demo@farisa.example','pbkdf2$100000$ZmFyaXNhLWRlbW8tdHIwMQ$56v6L6pwi5m9e_ty2XHH-yjPWyeKKPNgQvYNLqpZyTM','(00) 90000-0000','000000-G/UF',
  'Conta de demonstração com dados fictícios. Os dados voltam ao original todos os dias.','Plano profissional',60);

-- 3) Catálogo de exercícios (o mesmo da migração 013).
WITH catalog(name,muscle_group,equipment,difficulty,instructions) AS (
  VALUES
('Supino reto com barra','Peitoral','Barra e banco','Intermediário','Retraia as escápulas e controle a descida.'),
  ('Supino reto com halteres','Peitoral','Halteres e banco','Intermediário','Mantenha os punhos alinhados e controle a amplitude.'),
  ('Supino inclinado com barra','Peitoral','Barra e banco inclinado','Intermediário','Evite elevar os ombros durante o movimento.'),
  ('Supino declinado','Peitoral','Barra e banco declinado','Intermediário','Mantenha os pés firmes e as escápulas apoiadas.'),
  ('Crucifixo reto com halteres','Peitoral','Halteres e banco','Iniciante','Mantenha leve flexão dos cotovelos.'),
  ('Crucifixo inclinado com halteres','Peitoral','Halteres e banco inclinado','Intermediário','Abra os braços de forma controlada.'),
  ('Crossover alto','Peitoral','Polia','Intermediário','Conduza as mãos para baixo sem curvar o tronco.'),
  ('Crossover médio','Peitoral','Polia','Intermediário','Aproxime as mãos à frente do peitoral.'),
  ('Crossover baixo','Peitoral','Polia','Intermediário','Conduza as mãos para cima e para dentro.'),
  ('Peck deck','Peitoral','Máquina','Iniciante','Mantenha as costas apoiadas.'),
  ('Flexão de braços','Peitoral','Peso corporal','Iniciante','Mantenha o corpo alinhado.'),

  ('Puxada frontal aberta','Costas','Polia alta','Iniciante','Puxe em direção ao alto do peito.'),
  ('Puxada frontal fechada','Costas','Polia alta','Intermediário','Evite balançar o tronco.'),
  ('Puxada supinada','Costas','Polia alta','Intermediário','Mantenha o peito aberto.'),
  ('Barra fixa pronada','Costas','Barra fixa','Avançado','Inicie deprimindo as escápulas.'),
  ('Barra fixa supinada','Costas','Barra fixa','Avançado','Evite projetar a cabeça à frente.'),
  ('Remada curvada com barra','Costas','Barra','Intermediário','Preserve a coluna neutra.'),
  ('Remada unilateral com halter','Costas','Halter e banco','Iniciante','Puxe o cotovelo em direção ao quadril.'),
  ('Remada baixa triangulo','Costas','Polia baixa','Iniciante','Mantenha o tronco estável.'),
  ('Remada cavalinho','Costas','Barra T','Intermediário','Evite arredondar a lombar.'),
  ('Remada articulada','Costas','Máquina','Iniciante','Finalize aproximando as escápulas.'),
  ('Pullover na polia','Costas','Polia alta','Intermediário','Mantenha os braços quase estendidos.'),

  ('Desenvolvimento com halteres','Ombros','Halteres','Intermediário','Evite compensar com a lombar.'),
  ('Desenvolvimento militar com barra','Ombros','Barra','Intermediário','Mantenha o abdômen contraído.'),
  ('Desenvolvimento na máquina','Ombros','Máquina','Iniciante','Ajuste o banco à altura adequada.'),
  ('Elevação lateral com halteres','Ombros','Halteres','Iniciante','Eleve sem encolher os ombros.'),
  ('Elevação lateral na polia','Ombros','Polia baixa','Intermediário','Controle o retorno.'),
  ('Elevação frontal','Ombros','Halteres','Iniciante','Não ultrapasse excessivamente a linha dos ombros.'),
  ('Crucifixo inverso','Ombros','Halteres ou máquina','Intermediário','Mantenha as escápulas controladas.'),
  ('Face pull','Ombros','Polia e corda','Intermediário','Puxe a corda em direção ao rosto.'),

  ('Rosca direta com barra','Bíceps','Barra','Iniciante','Mantenha os cotovelos junto ao corpo.'),
  ('Rosca alternada','Bíceps','Halteres','Iniciante','Evite balançar o tronco.'),
  ('Rosca martelo','Bíceps','Halteres','Iniciante','Mantenha a pegada neutra.'),
  ('Rosca Scott','Bíceps','Banco Scott','Intermediário','Controle a extensão dos cotovelos.'),
  ('Rosca concentrada','Bíceps','Halter','Iniciante','Mantenha o braço apoiado.'),
  ('Rosca na polia baixa','Bíceps','Polia','Intermediário','Mantenha tensão contínua.'),

  ('Tríceps na polia com barra','Tríceps','Polia','Iniciante','Mantenha os cotovelos fixos.'),
  ('Tríceps corda','Tríceps','Polia e corda','Iniciante','Afaste as pontas da corda ao final.'),
  ('Tríceps francês unilateral','Tríceps','Halter','Intermediário','Evite abrir o cotovelo.'),
  ('Tríceps testa','Tríceps','Barra W','Intermediário','Controle a aproximação da barra.'),
  ('Mergulho no banco','Tríceps','Banco','Iniciante','Mantenha os ombros afastados das orelhas.'),
  ('Paralelas','Tríceps','Barras paralelas','Avançado','Controle a profundidade do movimento.'),

  ('Flexão de punho','Antebraços','Barra ou halteres','Iniciante','Movimente apenas os punhos.'),
  ('Extensão de punho','Antebraços','Barra ou halteres','Iniciante','Controle a amplitude.'),
  ('Rosca inversa','Antebraços','Barra','Intermediário','Use pegada pronada.'),

  ('Abdominal máquina','Abdômen','Máquina','Iniciante','Flexione o tronco sem puxar o pescoço.'),
  ('Abdominal supra','Abdômen','Colchonete','Iniciante','Retire as escápulas do chão.'),
  ('Abdominal infra','Abdômen','Colchonete','Iniciante','Controle a descida das pernas.'),
  ('Abdominal bicicleta','Abdômen','Colchonete','Intermediário','Alterne os lados sem puxar a cabeça.'),
  ('Elevação de pernas','Abdômen','Banco ou barra','Intermediário','Evite arquear a lombar.'),
  ('Prancha frontal','Abdômen','Peso corporal','Iniciante','Mantenha corpo e pelve alinhados.'),
  ('Prancha lateral','Abdômen','Peso corporal','Intermediário','Mantenha o quadril elevado.'),
  ('Pallof press','Abdômen','Polia ou elástico','Intermediário','Resista à rotação do tronco.'),

  ('Elevação pélvica','Glúteos','Barra e banco','Intermediário','Finalize contraindo os glúteos.'),
  ('Glúteo na polia','Glúteos','Polia','Iniciante','Evite girar a pelve.'),
  ('Glúteo quatro apoios','Glúteos','Peso corporal','Iniciante','Mantenha a lombar estável.'),
  ('Abdução de quadril máquina','Glúteos','Máquina','Iniciante','Controle a abertura das pernas.'),
  ('Passada com halteres','Glúteos','Halteres','Intermediário','Mantenha o joelho alinhado.'),
  ('Agachamento sumô','Glúteos','Halter ou barra','Intermediário','Mantenha joelhos na direção dos pés.'),

  ('Agachamento livre','Quadríceps','Barra','Intermediário','Mantenha o tronco firme e joelhos alinhados.'),
  ('Agachamento frontal','Quadríceps','Barra','Avançado','Mantenha os cotovelos elevados.'),
  ('Leg press 45 graus','Quadríceps','Leg press','Iniciante','Não retire o quadril do encosto.'),
  ('Hack squat','Quadríceps','Máquina','Intermediário','Mantenha a lombar apoiada.'),
  ('Cadeira extensora','Quadríceps','Máquina','Iniciante','Controle o retorno.'),
  ('Afundo búlgaro','Quadríceps','Banco e halteres','Intermediário','Distribua o peso no pé da frente.'),
  ('Passada caminhando','Quadríceps','Halteres','Intermediário','Mantenha estabilidade entre as passadas.'),

  ('Levantamento terra romeno','Posteriores de coxa','Barra','Intermediário','Leve o quadril para trás com coluna neutra.'),
  ('Stiff com halteres','Posteriores de coxa','Halteres','Intermediário','Mantenha leve flexão dos joelhos.'),
  ('Mesa flexora','Posteriores de coxa','Máquina','Iniciante','Mantenha o quadril apoiado.'),
  ('Cadeira flexora','Posteriores de coxa','Máquina','Iniciante','Controle a fase de retorno.'),
  ('Flexora unilateral em pé','Posteriores de coxa','Máquina','Intermediário','Evite girar a pelve.'),
  ('Good morning','Posteriores de coxa','Barra','Avançado','Use carga moderada e coluna neutra.'),

  ('Panturrilha em pé','Panturrilhas','Máquina','Iniciante','Use amplitude completa.'),
  ('Panturrilha sentada','Panturrilhas','Máquina','Iniciante','Faça uma pausa no topo.'),
  ('Panturrilha no leg press','Panturrilhas','Leg press','Intermediário','Movimente apenas os tornozelos.'),
  ('Panturrilha unilateral','Panturrilhas','Degrau','Intermediário','Controle a descida.'),

  ('Caminhada na esteira','Cardio e condicionamento','Esteira','Iniciante','Mantenha ritmo compatível com a prescrição.'),
  ('Corrida na esteira','Cardio e condicionamento','Esteira','Intermediário','Ajuste velocidade e inclinação.'),
  ('Bicicleta ergométrica','Cardio e condicionamento','Bicicleta','Iniciante','Ajuste o banco corretamente.'),
  ('Remo ergométrico','Cardio e condicionamento','Remo','Intermediário','Coordene pernas, tronco e braços.'),
  ('Burpee','Cardio e condicionamento','Peso corporal','Avançado','Mantenha técnica mesmo sob fadiga.'),

  ('Mobilidade de ombros','Mobilidade e aquecimento','Elástico ou bastão','Iniciante','Faça movimentos lentos e sem dor.'),
  ('Mobilidade de quadril','Mobilidade e aquecimento','Peso corporal','Iniciante','Trabalhe dentro da amplitude confortável.'),
  ('Mobilidade de tornozelo','Mobilidade e aquecimento','Peso corporal','Iniciante','Mantenha o calcanhar apoiado.'),
  ('Alongamento dinâmico de posteriores','Mobilidade e aquecimento','Peso corporal','Iniciante','Evite movimentos bruscos.'),
  ('Rotação torácica','Mobilidade e aquecimento','Peso corporal','Iniciante','Mantenha a pelve estável.')
)
INSERT INTO exercises (trainer_id,name,muscle_group,equipment,instructions,difficulty,media_type,is_active)
SELECT 'demo-trainer',c.name,c.muscle_group,c.equipment,c.instructions,c.difficulty,'video',1 FROM catalog c;

-- 4) Alunos fictícios.
INSERT INTO students (id,trainer_id,name,email,goal,status,assessment_date,account_id,access_status,plan_code,access_type,billing_cycle,access_expires_at,payment_status,payment_method,authorized_at,updated_at,created_at) VALUES
 ('demo-st-1','demo-trainer','Aluno Demonstração','aluno.demo@farisa.example','Hipertrofia','Ativo',date('now','+20 days'),'demo-student-account','active','premium','subscription','quarterly',datetime('now','+75 days'),'paid','pix',datetime('now','-15 days'),CURRENT_TIMESTAMP,datetime('now','-95 days')),
 ('demo-st-2','demo-trainer','Mariana Costa','mariana.costa@example.com','Emagrecimento','Ativo',date('now','+12 days'),NULL,'active','basic','subscription','monthly',datetime('now','+18 days'),'paid','credit_card',datetime('now','-12 days'),CURRENT_TIMESTAMP,datetime('now','-60 days')),
 ('demo-st-3','demo-trainer','Rafael Souza','rafael.souza@example.com','Condicionamento','Ativo',date('now','+40 days'),NULL,'active','athlete','subscription','annual',datetime('now','+300 days'),'paid','pix',datetime('now','-65 days'),CURRENT_TIMESTAMP,datetime('now','-70 days')),
 ('demo-st-4','demo-trainer','Juliana Alves','juliana.alves@example.com','Hipertrofia','Pausado',NULL,NULL,'pending','premium','subscription','quarterly',NULL,'pending','pix',NULL,CURRENT_TIMESTAMP,datetime('now','-2 days')),
 ('demo-st-5','demo-trainer','Pedro Martins','pedro.martins@example.com','Saúde e bem-estar','Ativo',NULL,NULL,'active','ready','permanent','permanent',NULL,'paid','pix',datetime('now','-30 days'),CURRENT_TIMESTAMP,datetime('now','-30 days')),
 ('demo-st-6','demo-trainer','Camila Rocha','camila.rocha@example.com','Emagrecimento','Ativo',date('now','+3 days'),NULL,'active','premium','subscription','quarterly',datetime('now','+5 days'),'paid','credit_card',datetime('now','-85 days'),CURRENT_TIMESTAMP,datetime('now','-88 days'));

-- 5) Conta de aluno de demonstração (ligada ao aluno demo-st-1).
INSERT INTO student_accounts (id,name,email,password_hash,trainer_id,student_id,requested_plan_code,requested_payment_channel,requested_billing_cycle,phone,birth_date,checkin_weekday)
VALUES ('demo-student-account','Aluno Demonstração','aluno.demo@farisa.example','pbkdf2$100000$ZmFyaXNhLWRlbW8tc3QwMQ$RVnAYpzW1mQGO8PrbW0j4cHzEI8kFSifI9WeIOCEmgg','demo-trainer','demo-st-1','premium','pix','quarterly','(00) 90000-0001','1995-04-12',1);

-- 6) Fichas de treino.
INSERT INTO workouts (id,trainer_id,student_id,name,goal,duration,progress,published_at,permanent_access,updated_at,created_at) VALUES
 ('demo-w-1','demo-trainer','demo-st-1','Hipertrofia ABC — Fase 1','Hipertrofia','8 semanas',45,datetime('now','-14 days'),0,CURRENT_TIMESTAMP,datetime('now','-15 days')),
 ('demo-w-2','demo-trainer','demo-st-2','Circuito metabólico','Emagrecimento','6 semanas',70,datetime('now','-10 days'),0,CURRENT_TIMESTAMP,datetime('now','-12 days')),
 ('demo-w-3','demo-trainer','demo-st-3','Força e potência','Condicionamento','10 semanas',30,datetime('now','-20 days'),0,CURRENT_TIMESTAMP,datetime('now','-21 days')),
 ('demo-w-6','demo-trainer','demo-st-6','Adaptação — rascunho','Emagrecimento','4 semanas',0,NULL,0,CURRENT_TIMESTAMP,datetime('now','-1 days'));
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Supino reto com barra' LIMIT 1),1,4,'8-10',90,'Controle a descida em 2 segundos.','A');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Supino inclinado com barra' LIMIT 1),2,3,'10-12',75,NULL,'A');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Crucifixo inclinado com halteres' LIMIT 1),3,3,'12',60,NULL,'A');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Tríceps corda' LIMIT 1),4,3,'12-15',60,NULL,'A');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Tríceps francês unilateral' LIMIT 1),5,3,'10-12',60,NULL,'A');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Puxada frontal aberta' LIMIT 1),6,4,'8-10',90,NULL,'B');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Remada curvada com barra' LIMIT 1),7,3,'8-10',90,'Coluna neutra durante toda a série.','B');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Remada unilateral com halter' LIMIT 1),8,3,'10-12',60,NULL,'B');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Rosca direta com barra' LIMIT 1),9,3,'10-12',60,NULL,'B');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Rosca martelo' LIMIT 1),10,3,'12',60,NULL,'B');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Agachamento livre' LIMIT 1),11,4,'8-10',120,'Aqueça com 2 séries leves antes.','C');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Leg press 45 graus' LIMIT 1),12,3,'10-12',90,NULL,'C');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Cadeira extensora' LIMIT 1),13,3,'12-15',60,NULL,'C');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Mesa flexora' LIMIT 1),14,3,'10-12',60,NULL,'C');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Panturrilha em pé' LIMIT 1),15,4,'15',45,NULL,'C');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-2',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Agachamento sumô' LIMIT 1),1,3,'15',45,NULL,'A');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-2',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Remada baixa triangulo' LIMIT 1),2,3,'15',45,NULL,'A');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-2',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Flexão de braços' LIMIT 1),3,3,'12',45,NULL,'A');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-2',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Elevação pélvica' LIMIT 1),4,3,'15',45,NULL,'A');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-2',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Prancha frontal' LIMIT 1),5,3,'40s',30,NULL,'A');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-2',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Bicicleta ergométrica' LIMIT 1),6,1,'20 min',0,'Ritmo moderado.','A');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-3',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Agachamento frontal' LIMIT 1),1,5,'5',150,NULL,'A');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-3',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Levantamento terra romeno' LIMIT 1),2,4,'6',120,NULL,'A');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-3',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Afundo búlgaro' LIMIT 1),3,3,'8',90,NULL,'A');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-3',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Desenvolvimento militar com barra' LIMIT 1),4,5,'5',120,NULL,'B');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-3',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Barra fixa pronada' LIMIT 1),5,4,'6-8',120,NULL,'B');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-3',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Burpee' LIMIT 1),6,4,'12',60,NULL,'B');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-6',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Leg press 45 graus' LIMIT 1),1,3,'15',60,NULL,'A');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-6',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Puxada frontal fechada' LIMIT 1),2,3,'12',60,NULL,'A');
INSERT INTO workout_exercises (workout_id,exercise_id,position,sets,repetitions,rest_seconds,notes,session_label) VALUES ('demo-w-6',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Caminhada na esteira' LIMIT 1),3,1,'25 min',0,NULL,'A');

-- 7) Avaliações físicas (evolução do aluno demo).
INSERT INTO assessments (id,trainer_id,student_id,protocol,weight_kg,height_cm,bmi,body_fat_percent,waist_cm,hip_cm,whr,chest_cm,arm_cm,thigh_cm,calf_cm,blood_pressure,resting_hr,push_ups,plank_seconds,sit_and_reach_cm,notes,published_at,assessed_at) VALUES
 ('demo-a-1','demo-trainer','demo-st-1','Inicial',84.2,178,26.6,22.5,92,101,0.91,102,35,58,38,'12/8',72,18,45,22,'Início do acompanhamento.',datetime('now','-90 days'),datetime('now','-90 days')),
 ('demo-a-2','demo-trainer','demo-st-1','Reavaliação',81.6,178,25.8,19.8,88,99,0.89,103,36,58,38,'12/8',68,24,70,25,'Boa evolução na composição corporal.',datetime('now','-45 days'),datetime('now','-45 days')),
 ('demo-a-3','demo-trainer','demo-st-1','Reavaliação',79.9,178,25.2,17.6,85,98,0.87,104,37,59,39,'11/7',64,30,95,27,'Meta de gordura corporal quase atingida.',datetime('now','-5 days'),datetime('now','-5 days')),
 ('demo-a-4','demo-trainer','demo-st-2','Inicial',72.5,165,26.6,31.2,86,104,0.83,NULL,NULL,NULL,NULL,'12/8',76,8,30,18,NULL,datetime('now','-58 days'),datetime('now','-58 days')),
 ('demo-a-5','demo-trainer','demo-st-2','Reavaliação',69.1,165,25.4,28.4,81,102,0.79,NULL,NULL,NULL,NULL,'12/8',71,12,50,21,NULL,datetime('now','-10 days'),datetime('now','-10 days'));

-- 8) Check-ins semanais.
INSERT INTO checkins (id,trainer_id,student_id,energy,sleep,pain,notes,trainer_feedback,created_at) VALUES
 ('demo-c-1','demo-trainer','demo-st-1',4,4,NULL,'Treinos da semana completos.','Ótimo! Na próxima semana vamos subir a carga do agachamento.',datetime('now','-7 days')),
 ('demo-c-2','demo-trainer','demo-st-1',5,3,'Leve dor no ombro direito','Dormi pouco na quarta.',NULL,datetime('now','-1 days')),
 ('demo-c-3','demo-trainer','demo-st-6',3,4,NULL,'Semana corrida, fiz 3 de 4 treinos.',NULL,datetime('now','-2 days'));

-- 9) Agenda (horários em UTC; 10h UTC = 7h em Brasília).
INSERT INTO appointments (id,trainer_id,student_id,starts_at,ends_at,service,location,notes,status) VALUES
 ('demo-ap-1','demo-trainer','demo-st-1',strftime('%Y-%m-%dT%H:%M:00.000Z','now','+1 days','start of day','+10 hours'),strftime('%Y-%m-%dT%H:%M:00.000Z','now','+1 days','start of day','+11 hours'),'Treino acompanhado','Academia FARISA',NULL,'scheduled'),
 ('demo-ap-2','demo-trainer','demo-st-2',strftime('%Y-%m-%dT%H:%M:00.000Z','now','+1 days','start of day','+21 hours'),strftime('%Y-%m-%dT%H:%M:00.000Z','now','+1 days','start of day','+22 hours'),'Avaliação física','Online (videochamada)',NULL,'scheduled'),
 ('demo-ap-3','demo-trainer','demo-st-3',strftime('%Y-%m-%dT%H:%M:00.000Z','now','+3 days','start of day','+12 hours'),strftime('%Y-%m-%dT%H:%M:00.000Z','now','+3 days','start of day','+13 hours'),'Teste de força','Academia FARISA','Trazer tênis de treino.','scheduled'),
 ('demo-ap-4','demo-trainer','demo-st-6',strftime('%Y-%m-%dT%H:%M:00.000Z','now','-2 days','start of day','+11 hours'),strftime('%Y-%m-%dT%H:%M:00.000Z','now','-2 days','start of day','+12 hours'),'Reavaliação','Academia FARISA',NULL,'completed');

-- 10) Pagamentos (fictícios, sem cobrança real).
INSERT INTO payments (id,trainer_id,student_id,plan_code,amount_cents,status,method,provider,provider_reference,paid_at,billing_cycle,created_at) VALUES
 ('demo-pay-1','demo-trainer','demo-st-1','premium',(SELECT price_cents FROM plans WHERE code='premium')*3,'paid','pix','demo',NULL,datetime('now','-15 days'),'quarterly',datetime('now','-15 days')),
 ('demo-pay-2','demo-trainer','demo-st-2','basic',(SELECT price_cents FROM plans WHERE code='basic'),'paid','credit_card','demo',NULL,datetime('now','-12 days'),'monthly',datetime('now','-12 days')),
 ('demo-pay-3','demo-trainer','demo-st-3','athlete',(SELECT price_cents FROM plans WHERE code='athlete')*12,'paid','pix','demo',NULL,datetime('now','-65 days'),'annual',datetime('now','-65 days')),
 ('demo-pay-4','demo-trainer','demo-st-5','ready',(SELECT price_cents FROM plans WHERE code='ready'),'paid','pix','demo',NULL,datetime('now','-30 days'),'permanent',datetime('now','-30 days')),
 ('demo-pay-5','demo-trainer','demo-st-6','premium',(SELECT price_cents FROM plans WHERE code='premium')*3,'paid','credit_card','demo',NULL,datetime('now','-85 days'),'quarterly',datetime('now','-85 days'));

-- 11) Treino pronto publicado.
INSERT INTO ready_workout_programs (id,trainer_id,name,goal,level,duration,description,color_theme,published,created_at,updated_at)
VALUES ('demo-rp-1','demo-trainer','Full Body para iniciantes','Condicionamento','Iniciante','4 semanas','Dois treinos alternados (A e B), três vezes por semana.','blue',1,datetime('now','-30 days'),datetime('now','-30 days'));
INSERT INTO ready_program_exercises (program_id,exercise_id,position,session_label,sets,repetitions,rest_seconds) VALUES ('demo-rp-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Agachamento livre' LIMIT 1),1,'A',3,'12',75);
INSERT INTO ready_program_exercises (program_id,exercise_id,position,session_label,sets,repetitions,rest_seconds) VALUES ('demo-rp-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Supino reto com halteres' LIMIT 1),2,'A',3,'12',60);
INSERT INTO ready_program_exercises (program_id,exercise_id,position,session_label,sets,repetitions,rest_seconds) VALUES ('demo-rp-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Remada baixa triangulo' LIMIT 1),3,'A',3,'12',60);
INSERT INTO ready_program_exercises (program_id,exercise_id,position,session_label,sets,repetitions,rest_seconds) VALUES ('demo-rp-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Desenvolvimento com halteres' LIMIT 1),4,'A',3,'12',60);
INSERT INTO ready_program_exercises (program_id,exercise_id,position,session_label,sets,repetitions,rest_seconds) VALUES ('demo-rp-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Prancha frontal' LIMIT 1),5,'A',3,'30s',30);
INSERT INTO ready_program_exercises (program_id,exercise_id,position,session_label,sets,repetitions,rest_seconds) VALUES ('demo-rp-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Leg press 45 graus' LIMIT 1),6,'B',3,'12',75);
INSERT INTO ready_program_exercises (program_id,exercise_id,position,session_label,sets,repetitions,rest_seconds) VALUES ('demo-rp-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Puxada frontal aberta' LIMIT 1),7,'B',3,'12',60);
INSERT INTO ready_program_exercises (program_id,exercise_id,position,session_label,sets,repetitions,rest_seconds) VALUES ('demo-rp-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Elevação lateral com halteres' LIMIT 1),8,'B',3,'15',45);
INSERT INTO ready_program_exercises (program_id,exercise_id,position,session_label,sets,repetitions,rest_seconds) VALUES ('demo-rp-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Elevação pélvica' LIMIT 1),9,'B',3,'15',45);
INSERT INTO ready_program_exercises (program_id,exercise_id,position,session_label,sets,repetitions,rest_seconds) VALUES ('demo-rp-1',(SELECT id FROM exercises WHERE trainer_id='demo-trainer' AND name='Abdominal bicicleta' LIMIT 1),10,'B',3,'20',30);
