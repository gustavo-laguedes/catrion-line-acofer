# Catrion Line database schema

## Baseline oficial

`000_baseline_homolog.sql` e o ponto inicial oficial atual do schema do Catrion Line.

Esta baseline foi gerada a partir do schema real do Neon homolog e deve ser usada como referencia para criar ambientes novos a partir de um banco vazio.

## Historico pre-baseline

Os arquivos em `_historico_pre_baseline` sao historicos e estao defasados em relacao ao schema real atual do homolog.

Eles foram preservados apenas para auditoria e contexto tecnico. Nao devem ser aplicados em ambientes atuais.

Nunca aplicar `001_core.sql` em production ou no homolog atual.

## Futuras mudancas

Futuras alteracoes estruturais devem ser criadas como migrations incrementais apos `000_baseline_homolog.sql`.
