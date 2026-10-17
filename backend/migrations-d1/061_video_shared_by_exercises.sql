-- O mesmo vídeo MP4 pode ser usado em mais de um exercício (como o GIF).
-- O índice único da 056 fazia o "Escolher vídeo" da ficha dar erro quando o
-- vídeo já estava ligado a outro exercício. Só remove o índice; nenhum dado
-- ou coluna é apagado.
DROP INDEX IF EXISTS exercises_trainer_video_unique_idx;
