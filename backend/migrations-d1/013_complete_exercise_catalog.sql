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
SELECT t.id,c.name,c.muscle_group,c.equipment,c.instructions,c.difficulty,'video',1
FROM trainers t CROSS JOIN catalog c
WHERE NOT EXISTS (
  SELECT 1 FROM exercises e WHERE e.trainer_id=t.id AND lower(e.name)=lower(c.name)
);
