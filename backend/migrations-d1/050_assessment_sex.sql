-- Sexo do aluno na avaliação física: classifica o % de gordura pela faixa
-- certa (homem/mulher) e mostra o IMC só como informação secundária.
ALTER TABLE assessments ADD COLUMN sex TEXT;
